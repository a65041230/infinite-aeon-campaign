import Anthropic from "@anthropic-ai/sdk";

// Backend for the Doubt-Driven 鑑別工作台 page (public/ddx/index.html).
// Visitors need no account: calls run on this site's own API key, gated by the
// DDX_ACCESS_KEY code that the shared link carries.
//
// Provider: Claude (ANTHROPIC_API_KEY) by default, or DeepSeek (DEEPSEEK_API_KEY).
// DDX_PROVIDER=anthropic|deepseek forces one; otherwise the first key present wins.
//
// Edge runtime: the response starts streaming at once and may keep streaming
// for several minutes, which a long clinical-reasoning answer can need.
export const runtime = "edge";

const MAX_PROMPT_CHARS = 60_000;
const TASK_EFFORT = { reason: "high", critic: "high", comm: "medium" } as const;
type Task = keyof typeof TASK_EFFORT;
type Send = (event: Record<string, unknown>) => void;

const SYSTEM =
  "這是給台灣執業醫師使用的臨床推理輔助工具的後端，使用者是醫師本人。" +
  "只處理臨床推理、反方審查與醫病溝通的請求，並嚴格依照使用者訊息指定的 JSON 格式回覆。";

type Provider = { name: "anthropic" | "deepseek"; key: string; model: string };
function pickProvider(): Provider | null {
  const forced = (process.env.DDX_PROVIDER ?? "").trim().toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";
  const model = (process.env.DDX_MODEL ?? "").trim();
  const useDeepSeek = forced === "deepseek" || (forced !== "anthropic" && !anthropicKey && !!deepseekKey);
  if (useDeepSeek) return deepseekKey ? { name: "deepseek", key: deepseekKey, model: model || "deepseek-flash" } : null;
  return anthropicKey ? { name: "anthropic", key: anthropicKey, model: model || "claude-opus-5-5" } : null;
}

// Best-effort limiter per server instance. The real cost guard is the spend
// limit set with the API provider.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();
function rateLimited(client: string): boolean {
  const now = Date.now();
  const recent = (hits.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  const limited = recent.length >= MAX_PER_WINDOW;
  if (!limited) recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(client, recent);
  return limited;
}

function accessOk(given: string | null): boolean {
  const keys = (process.env.DDX_ACCESS_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return !!given && keys.includes(given.trim());
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function claudeErrorCode(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) return "cancelled";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "not_configured";
  }
  if (err instanceof Anthropic.BadRequestError) return "invalid_request";
  return "upstream_error";
}

async function streamClaude(p: Provider, task: Task, prompt: string, signal: AbortSignal, send: Send) {
  const anthropic = new Anthropic({ apiKey: p.key });
  try {
    const message = anthropic.beta.messages.stream(
      {
        model: p.model,
        max_tokens: 20_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: TASK_EFFORT[task] },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      },
      { signal },
    );
    for await (const event of message) {
      if (event.type === "content_block_start" && event.content_block.type === "fallback") {
        send({ t: "reset" });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send({ t: "d", d: event.delta.text });
      }
    }
    const final = await message.finalMessage();
    if (final.stop_reason === "refusal") send({ t: "error", error: "refused" });
    else send({ t: "done", model: final.model, truncated: final.stop_reason === "max_tokens" });
  } catch (err) {
    send({ t: "error", error: claudeErrorCode(err) });
  }
}

// DeepSeek's Chat Completions API (OpenAI-style server-sent events).
type DeepSeekChunk = {
  model?: string;
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
};
async function streamDeepSeek(p: Provider, prompt: string, signal: AbortSignal, send: Send) {
  const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        stream: true,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
      signal,
    });
  } catch {
    send({ t: "error", error: signal.aborted ? "cancelled" : "upstream_error" });
    return;
  }
  if (!res.ok || !res.body) {
    const s = res.status;
    const code =
      s === 401 || s === 403 ? "not_configured" :
      s === 402 ? "no_credit" :
      s === 429 ? "rate_limited" :
      s === 400 || s === 422 ? "invalid_request" : "upstream_error";
    send({ t: "error", error: code });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finish: string | null = null;
  let model = p.model;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // blank lines and ": keep-alive" comments
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let parsed: DeepSeekChunk;
        try {
          parsed = JSON.parse(data) as DeepSeekChunk;
        } catch {
          continue;
        }
        if (parsed.model) model = parsed.model;
        const choice = parsed.choices?.[0];
        if (choice?.delta?.content) send({ t: "d", d: choice.delta.content });
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
    }
  } catch {
    send({ t: "error", error: signal.aborted ? "cancelled" : "upstream_error" });
    return;
  }
  if (finish === "content_filter") send({ t: "error", error: "refused" });
  else send({ t: "done", model, truncated: finish === "length" });
}

export async function POST(req: Request): Promise<Response> {
  const provider = pickProvider();
  if (!provider || !process.env.DDX_ACCESS_KEY) return json(503, { error: "not_configured" });
  if (!accessOk(req.headers.get("x-ddx-key"))) return json(401, { error: "bad_key" });

  const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(client)) return json(429, { error: "rate_limited" });

  let body: { task?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_request" });
  }
  const task = body.task;
  const prompt = body.prompt;
  if (typeof task !== "string" || !(task in TASK_EFFORT) || typeof prompt !== "string" || !prompt.trim()) {
    return json(400, { error: "invalid_request" });
  }
  if (prompt.length > MAX_PROMPT_CHARS) return json(413, { error: "prompt_too_large" });

  const encoder = new TextEncoder();
  // Newline-delimited JSON events: {t:"d"} text, {t:"reset"} discard text so far
  // (a fallback model took over), {t:"ping"} keep-alive, then {t:"done"} or {t:"error"}.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
    },
    async start(controller) {
      const send: Send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false; // the visitor closed the page
        }
      };
      const ping = setInterval(() => send({ t: "ping" }), 15_000);
      try {
        if (provider.name === "deepseek") await streamDeepSeek(provider, prompt, req.signal, send);
        else await streamClaude(provider, task as Task, prompt, req.signal, send);
      } finally {
        clearInterval(ping);
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // already closed by the visitor leaving
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
