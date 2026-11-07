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
export const maxDuration = 300;

const MAX_PROMPT_CHARS = 60_000;
const TASK_EFFORT = { reason: "high", critic: "high", comm: "medium" } as const;
type Task = keyof typeof TASK_EFFORT;
type Send = (event: Record<string, unknown>) => void;

const SYSTEM =
  "這是給台灣執業醫師使用的臨床推理輔助工具的後端，使用者是醫師本人。" +
  "只處理臨床推理、反方審查與醫病溝通的請求，並嚴格依照使用者訊息指定的 JSON 格式回覆。";

// "deepseek" covers any OpenAI-style Chat Completions endpoint: DeepSeek's own
// API, or OpenRouter when the key is an OpenRouter key (sk-or-…).
type Provider = { name: "anthropic" | "deepseek"; key: string; model: string; base: string; openRouter: boolean };

// Tolerate common paste slips in the dashboard: surrounding spaces or quotes,
// or a "Bearer " prefix copied along with the key.
function cleanKey(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
}

function pickProvider(): Provider | null {
  const forced = (process.env.DDX_PROVIDER ?? "").trim().toLowerCase();
  const anthropicKey = cleanKey(process.env.ANTHROPIC_API_KEY);
  const deepseekKey = cleanKey(process.env.DEEPSEEK_API_KEY) || cleanKey(process.env.OPENROUTER_API_KEY);
  const model = (process.env.DDX_MODEL ?? "").trim();
  const useDeepSeek = forced === "deepseek" || (forced !== "anthropic" && !anthropicKey && !!deepseekKey);
  if (useDeepSeek) {
    if (!deepseekKey) return null;
    const openRouter = deepseekKey.startsWith("sk-or-");
    // OpenRouter also serves the Anthropic Messages API, so Claude models
    // (DDX_MODEL=anthropic/...) go through the official SDK instead.
    if (openRouter && model.startsWith("anthropic/")) {
      return { name: "anthropic", key: deepseekKey, model, base: "https://openrouter.ai/api", openRouter };
    }
    const base = process.env.DEEPSEEK_BASE_URL || (openRouter ? "https://openrouter.ai/api/v1" : "https://api.deepseek.com");
    return {
      name: "deepseek",
      key: deepseekKey,
      model: model || (openRouter ? "deepseek/deepseek-v4.1-flash" : "deepseek-flash"),
      base: base.replace(/\/+$/, ""),
      openRouter,
    };
  }
  return anthropicKey
    ? { name: "anthropic", key: anthropicKey, model: model || "claude-opus-5-5", base: "", openRouter: false }
    : null;
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

// DDX_PUBLIC=1 lets anyone with the address use the site. Otherwise the
// DDX_ACCESS_KEY code carried by the shared link is required.
function isPublic(): boolean {
  return /^(1|true|yes)$/i.test((process.env.DDX_PUBLIC ?? "").trim());
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
  // The SDK sends the key as a Bearer token, which OpenRouter also accepts.
  const anthropic = new Anthropic(p.base ? { apiKey: p.key, baseURL: p.base } : { apiKey: p.key });
  try {
    let final: { stop_reason: string | null; model: string };
    if (p.base) {
      final = await streamClaudeViaOpenRouter(anthropic, p.model, task, prompt, signal, send);
    } else {
      const message = anthropic.beta.messages.stream(
        {
          model: p.model,
          max_tokens: 32_000, // thinking at high effort counts toward this too
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
      final = await message.finalMessage();
    }
    if (final.stop_reason === "refusal") send({ t: "error", error: "refused" });
    else send({ t: "done", model: final.model, truncated: final.stop_reason === "max_tokens" });
  } catch (err) {
    const code = claudeErrorCode(err);
    if (code !== "cancelled") {
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      console.error(`[ddx] Claude ${status ?? "network"} error: ${String(err).slice(0, 300)}`);
    }
    send({ t: "error", error: code });
  }
}

// OpenRouter's Messages-compatible endpoint rejects Anthropic beta parameters,
// so this route has no refusal fallbacks. Should it also reject the effort
// setting, the request is retried once at the model's default effort.
async function streamClaudeViaOpenRouter(
  anthropic: Anthropic,
  model: string,
  task: Task,
  prompt: string,
  signal: AbortSignal,
  send: Send,
): Promise<Anthropic.Message> {
  const request = {
    model,
    max_tokens: 32_000,
    system: SYSTEM,
    messages: [{ role: "user" as const, content: prompt }],
  };
  try {
    return await pipeClaude(anthropic.messages.stream({ ...request, output_config: { effort: TASK_EFFORT[task] } }, { signal }), send);
  } catch (err) {
    if (!(err instanceof NothingSentError) || !(err.cause instanceof Anthropic.BadRequestError)) throw err instanceof NothingSentError ? err.cause : err;
    console.error(`[ddx] OpenRouter rejected the effort setting; retrying without it: ${String(err.cause).slice(0, 200)}`);
    return await pipeClaude(anthropic.messages.stream(request, { signal }), send).catch((e) => {
      throw e instanceof NothingSentError ? e.cause : e;
    });
  }
}

// Marks a failure that happened before any text reached the visitor, so a
// retry cannot duplicate output.
class NothingSentError extends Error {}

async function pipeClaude(message: ReturnType<Anthropic["messages"]["stream"]>, send: Send): Promise<Anthropic.Message> {
  let sent = false;
  try {
    for await (const event of message) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        sent = true;
        send({ t: "d", d: event.delta.text });
      }
    }
    return await message.finalMessage();
  } catch (err) {
    throw sent ? err : new NothingSentError("request failed before output", { cause: err });
  }
}

// DeepSeek's Chat Completions API (OpenAI-style server-sent events), called
// directly or through OpenRouter.
type DeepSeekChunk = {
  model?: string;
  error?: { message?: string; code?: number | string };
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
};
async function streamDeepSeek(p: Provider, prompt: string, signal: AbortSignal, send: Send) {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${p.key}` };
  const body: Record<string, unknown> = {
    model: p.model,
    stream: true,
    max_tokens: 20_000, // room for long critiques; V4.1 Flash allows far more
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
  };
  if (p.openRouter) {
    headers["x-title"] = "Doubt-Driven DDx";
    // Only route to hosts that neither store nor train on the case text.
    body.provider = { data_collection: "deny" };
  }
  let res: Response;
  try {
    res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    send({ t: "error", error: signal.aborted ? "cancelled" : "upstream_error" });
    return;
  }
  if (!res.ok || !res.body) {
    const s = res.status;
    // DeepSeek's error body names the cause (bad key, unknown model, no
    // balance). Log it for the site owner; the visitor only sees the code.
    const detail = await res.text().catch(() => "");
    console.error(`[ddx] ${p.openRouter ? "OpenRouter" : "DeepSeek"} HTTP ${s}: ${detail.slice(0, 300)}`);
    const code =
      s === 401 || s === 403 ? "not_configured" :
      s === 402 ? "no_credit" :
      s === 429 ? "rate_limited" :
      s === 400 || s === 422 ? "invalid_request" : "upstream_error";
    send({ t: "error", error: code, status: s });
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
        if (parsed.error) {
          // OpenRouter reports failures after the stream has started this way.
          console.error(`[ddx] stream error: ${JSON.stringify(parsed.error).slice(0, 300)}`);
          send({ t: "error", error: "upstream_error" });
          return;
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
  const publicSite = isPublic();
  if (!provider || (!publicSite && !process.env.DDX_ACCESS_KEY)) return json(503, { error: "not_configured" });
  if (!publicSite) {
    const given = req.headers.get("x-ddx-key");
    if (!given?.trim()) return json(401, { error: "no_key" });
    if (!accessOk(given)) return json(401, { error: "bad_key" });
  }

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
