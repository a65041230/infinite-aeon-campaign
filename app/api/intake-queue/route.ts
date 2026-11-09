// Today's pre-visit interviews (/ddx/intake) for each clinic, so the doctor
// picks a patient from a numbered list instead of borrowing the patient's device.
//
// A clinic is one DDX_ACCESS_KEY code:
// - the patient link carries a submit token derived from the code; it can only
//   add records to that clinic's list;
// - listing, opening and deleting records need the code itself (x-ddx-key).
// Records are sealed with a key derived from DDX_QUEUE_SECRET and the code, so
// the database alone does not reveal them. After 12 hours they are no longer
// shown and are deleted the next time anyone submits or opens a list.
// Numbers restart every day, Taiwan time.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import QRCode from "qrcode";

export const maxDuration = 30;

const KEEP_HOURS = 12;
const MAX_PER_DAY = 300;
const MAX_BODY_CHARS = 64_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const ID_RE = /^[A-Za-z0-9_-]{16}$/;

type Sql = NeonQueryFunction<false, false>;
type IntakeRecord = {
  age: string;
  sex: string;
  cc: string;
  hpi: string;
  pmh: string;
  emergency: string;
  alerts: string[];
  at: number;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// The same comma-separated codes /api/ddx accepts.
function accessCodes(): string[] {
  return (process.env.DDX_ACCESS_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function derive(purpose: string, code: string): Buffer {
  return createHmac("sha256", process.env.DDX_QUEUE_SECRET ?? "").update(`${purpose}\0${code}`).digest();
}
const clinicOf = (code: string) => derive("clinic", code).toString("base64url").slice(0, 22);
const submitTokenOf = (code: string) => derive("submit", code).toString("base64url").slice(0, 22);

function codeForSubmitToken(token: string): string | null {
  const given = Buffer.from(token);
  for (const code of accessCodes()) {
    const want = Buffer.from(submitTokenOf(code));
    if (want.length === given.length && timingSafeEqual(want, given)) return code;
  }
  return null;
}

// AES-256-GCM with the row id as associated data. Layout: iv(12) | tag(16) | ciphertext.
function seal(code: string, id: string, rec: IntakeRecord): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive("seal", code), iv);
  cipher.setAAD(Buffer.from(id));
  const body = Buffer.concat([cipher.update(JSON.stringify(rec), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function unseal(code: string, id: string, box: string): IntakeRecord | null {
  try {
    const raw = Buffer.from(box, "base64");
    const decipher = createDecipheriv("aes-256-gcm", derive("seal", code), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

function text(v: unknown, max: number): string {
  return typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
}
// Keeps only the fields the workbench fills in; the time is the server's.
function cleanRecord(v: unknown): IntakeRecord | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const rec: IntakeRecord = {
    age: text(o.age, 8),
    sex: text(o.sex, 4),
    cc: text(o.cc, 500),
    hpi: text(o.hpi, 12_000),
    pmh: text(o.pmh, 3_000),
    emergency: text(o.emergency, 500),
    alerts: (Array.isArray(o.alerts) ? o.alerts : []).map((a) => text(a, 300)).filter(Boolean).slice(0, 3),
    at: Date.now(),
  };
  return rec.cc ? rec : null;
}

// Taiwan keeps UTC+8 all year.
const taiwanDay = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

// Per-instance speed bump; the daily cap in the database is the real limit.
const WINDOW_MS = 10 * 60_000;
const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const limited = recent.length >= max;
  if (!limited) recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, recent);
  return limited;
}

let schemaReady: Promise<unknown> | null = null;
function ensureSchema(sql: Sql): Promise<unknown> {
  schemaReady ??= sql
    .transaction([
      sql`CREATE TABLE IF NOT EXISTS intake_queue (
        id text PRIMARY KEY,
        clinic text NOT NULL,
        day date NOT NULL,
        num integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        taken_at timestamptz,
        urgent boolean NOT NULL DEFAULT false,
        box text NOT NULL,
        UNIQUE (clinic, day, num)
      )`,
      sql`CREATE TABLE IF NOT EXISTS intake_counter (
        clinic text NOT NULL,
        day date NOT NULL,
        n integer NOT NULL,
        PRIMARY KEY (clinic, day)
      )`,
    ])
    .catch((err) => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

async function submit(sql: Sql, code: string, clinic: string, value: unknown): Promise<Response> {
  const rec = cleanRecord(value);
  if (!rec) return json(400, { error: "bad_record" });
  const id = randomBytes(12).toString("base64url");
  const day = taiwanDay();
  const box = seal(code, id, rec);
  // Old records go first; then the day's counter and the record move together.
  const results = await sql.transaction([
    sql`DELETE FROM intake_queue WHERE created_at < now() - make_interval(hours => ${KEEP_HOURS})`,
    sql`DELETE FROM intake_counter WHERE day < ${day}::date - 2`,
    sql`WITH c AS (
          INSERT INTO intake_counter (clinic, day, n) VALUES (${clinic}, ${day}::date, 1)
          ON CONFLICT (clinic, day) DO UPDATE SET n = intake_counter.n + 1
          RETURNING n
        )
        INSERT INTO intake_queue (id, clinic, day, num, urgent, box)
        SELECT ${id}, ${clinic}, ${day}::date, n, ${rec.emergency ? "true" : "false"}::boolean, ${box} FROM c
        WHERE n <= ${MAX_PER_DAY}
        RETURNING num`,
  ]);
  const rows = results[2] as { num: number }[];
  if (!rows.length) return json(429, { error: "queue_full" });
  return json(200, { num: rows[0].num, day });
}

async function list(sql: Sql, code: string, clinic: string): Promise<Response> {
  const day = taiwanDay();
  // Opening the list also clears expired records, so they do not wait for the next patient.
  const [, found] = await sql.transaction([
    sql`DELETE FROM intake_queue WHERE created_at < now() - make_interval(hours => ${KEEP_HOURS})`,
    sql`SELECT id, num, taken_at, urgent, box FROM intake_queue
        WHERE clinic = ${clinic} AND day = ${day}::date
          AND created_at > now() - make_interval(hours => ${KEEP_HOURS})
        ORDER BY num`,
  ]);
  const rows = found as { id: string; num: number; taken_at: unknown; urgent: boolean; box: string }[];
  const items = rows.flatMap((r) => {
    const rec = unseal(code, r.id, r.box);
    if (!rec) return [];
    return [{
      id: r.id,
      num: r.num,
      at: rec.at,
      taken: r.taken_at != null,
      urgent: r.urgent,
      alerts: rec.alerts.length > 0,
      age: rec.age,
      sex: rec.sex,
      cc: rec.cc.slice(0, 80),
    }];
  });
  return json(200, { day, items });
}

async function take(sql: Sql, code: string, clinic: string, id: string): Promise<Response> {
  const rows = (await sql`
    UPDATE intake_queue SET taken_at = COALESCE(taken_at, now())
    WHERE id = ${id} AND clinic = ${clinic}
      AND created_at > now() - make_interval(hours => ${KEEP_HOURS})
    RETURNING num, box`) as { num: number; box: string }[];
  if (!rows.length) return json(404, { error: "gone" });
  const record = unseal(code, id, rows[0].box);
  return record ? json(200, { num: rows[0].num, record }) : json(500, { error: "unreadable" });
}

// The address patients open; the QR code is for a poster in the waiting room.
async function link(req: Request, code: string): Promise<Response> {
  const url = `${new URL(req.url).origin}/ddx/intake?c=${submitTokenOf(code)}`;
  const qr = await QRCode.toDataURL(url, { margin: 2, width: 480, errorCorrectionLevel: "M" });
  return json(200, { url, qr });
}

export async function POST(req: Request): Promise<Response> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl || (process.env.DDX_QUEUE_SECRET ?? "").length < 16 || !accessCodes().length) {
    return json(503, { error: "queue_off" });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return json(413, { error: "too_large" });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "bad_request" });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  let code: string | null;
  if (action === "submit") {
    if (rateLimited(`submit:${client}`, 40)) return json(429, { error: "rate_limited" });
    const token = typeof body.clinic === "string" ? body.clinic : "";
    code = TOKEN_RE.test(token) ? codeForSubmitToken(token) : null;
    if (!code) return json(404, { error: "unknown_clinic" });
  } else {
    if (rateLimited(`read:${client}`, 600)) return json(429, { error: "rate_limited" });
    const given = (req.headers.get("x-ddx-key") ?? "").trim();
    if (!given) return json(401, { error: "no_key" });
    code = accessCodes().includes(given) ? given : null;
    if (!code) return json(401, { error: "bad_key" });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if ((action === "take" || action === "delete") && !ID_RE.test(id)) return json(400, { error: "bad_request" });
  try {
    if (action === "link") return await link(req, code);
    const sql = neon(dbUrl);
    await ensureSchema(sql);
    const clinic = clinicOf(code);
    switch (action) {
      case "submit":
        return await submit(sql, code, clinic, body.record);
      case "list":
        return await list(sql, code, clinic);
      case "take":
        return await take(sql, code, clinic, id);
      case "delete":
        await sql`DELETE FROM intake_queue WHERE id = ${id} AND clinic = ${clinic}`;
        return json(200, { ok: true });
      default:
        return json(400, { error: "bad_request" });
    }
  } catch (err) {
    // Never log record contents; the message is enough to find the cause.
    console.error(`[intake-queue] ${action}: ${err instanceof Error ? err.message.slice(0, 200) : "error"}`);
    return json(502, { error: "queue_error" });
  }
}
