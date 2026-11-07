// PubMed lookups for the DDx page's "to verify" list, so the doctor sees real
// article titles and links. Only the AI-written English keywords arrive here;
// the case text is never sent to NCBI.
export const runtime = "edge";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const MAX_QUERY_CHARS = 300;
const MAX_RESULTS = 3;

// NCBI allows about three requests a second without an API key; the page
// already asks one item at a time, this only stops a single visitor flooding it.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
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

function json(status: number, body: Record<string, unknown>, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheSeconds ? `public, s-maxage=${cacheSeconds}, max-age=3600` : "no-store",
    },
  });
}

type SearchResult = { esearchresult?: { idlist?: string[] } };
type SummaryDoc = { title?: string; source?: string; pubdate?: string };
type SummaryResult = { result?: { uids?: string[] } & Record<string, SummaryDoc | string[] | undefined> };

async function eutils<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ db: "pubmed", retmode: "json", tool: "doubt-ddx", ...params });
  const res = await fetch(`${EUTILS}/${path}?${qs}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`NCBI ${res.status}`);
  return (await res.json()) as T;
}

export async function GET(req: Request): Promise<Response> {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_CHARS);
  if (!q) return json(400, { error: "invalid_request" });

  const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(client)) return json(429, { error: "rate_limited" });

  try {
    const search = await eutils<SearchResult>("esearch.fcgi", { term: q, retmax: String(MAX_RESULTS), sort: "relevance" });
    const ids = (search.esearchresult?.idlist ?? []).filter((id) => /^\d+$/.test(id)).slice(0, MAX_RESULTS);
    if (!ids.length) return json(200, { items: [] }, 86_400);

    const summary = await eutils<SummaryResult>("esummary.fcgi", { id: ids.join(",") });
    const result = summary.result ?? {};
    const items = ids.map((pmid) => {
      const doc = (result[pmid] ?? {}) as SummaryDoc;
      return {
        pmid,
        title: (doc.title ?? "").replace(/\s+/g, " ").trim(),
        journal: doc.source ?? "",
        year: (doc.pubdate ?? "").slice(0, 4),
      };
    });
    return json(200, { items }, 86_400);
  } catch (err) {
    console.error(`[pubmed] lookup failed: ${String(err).slice(0, 200)}`);
    return json(502, { error: "upstream_error" });
  }
}
