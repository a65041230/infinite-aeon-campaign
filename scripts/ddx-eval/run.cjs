'use strict';
// Exam-bank runner: fills each case in cases.json into the live DDX site, runs the
// analysis, waits for the critic, and scores must_rule_out / bedside expectations.
// Every run spends real API credit. Exit 0 even when expectations fail; exit 1 only on crashes.

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const CASES_FILE = path.join(__dirname, 'cases.json');
const DEFAULT_SITE = 'https://doubt-ddx.vercel.app';
const SIMPLIFIED = /[们这说过对时发经检诊断脑压风险吗还让应该与为无门问题见]/g;
const FIELD_IDS = { age: 'f-age', sex: 'f-sex', setting: 'f-setting', reliability: 'f-rel', cc: 'f-cc', hpi: 'f-hpi', pmh: 'f-pmh', pe: 'f-pe', labs: 'f-labs', thoughts: 'f-thoughts' };
const SELECT_KEYS = new Set(['sex', 'setting', 'reliability']);
const POLL_MAX = 84;
const POLL_MS = 5000;

const USAGE = `用法: node scripts/ddx-eval/run.cjs [選項]
  --runs N           每個病例×模型跑幾次（預設 1）
  --models a,b       模型清單；default = 不送 x-ddx-model 標頭（預設 default）
  --cases id1,id2    只跑指定病例（預設全部）
  --site URL         網站位址（預設 ${DEFAULT_SITE}）
  --out DIR          結果輸出資料夾（預設 ./ddx-eval-results）
  --concurrency N    同時進行的工作數（預設 6）
  --help             顯示此說明
注意：每一次執行都會花費真實的 API 費用。`;

class UsageError extends Error {}

function splitList(s) {
  const list = String(s).split(',').map((x) => x.trim()).filter(Boolean);
  if (!list.length) throw new UsageError(`清單不能是空的: "${s}"`);
  return list;
}

function toPosInt(s, name) {
  if (!/^\d+$/.test(String(s)) || Number(s) < 1) throw new UsageError(`${name} 必須是 1 以上的整數: "${s}"`);
  return Number(s);
}

function parseArgs(argv) {
  const opt = {
    runs: 1,
    models: ['default'],
    cases: null,
    site: DEFAULT_SITE,
    out: path.join(process.cwd(), 'ddx-eval-results'),
    concurrency: 6,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let flag = a;
    let inline;
    if (a.startsWith('--') && a.includes('=')) {
      flag = a.slice(0, a.indexOf('='));
      inline = a.slice(a.indexOf('=') + 1);
    }
    const value = () => {
      if (inline !== undefined) return inline;
      i++;
      if (i >= argv.length) throw new UsageError(`${flag} 需要一個值`);
      return argv[i];
    };
    switch (flag) {
      case '--runs': opt.runs = toPosInt(value(), '--runs'); break;
      case '--models': opt.models = splitList(value()); break;
      case '--cases': opt.cases = splitList(value()); break;
      case '--site': opt.site = value().trim().replace(/\/+$/, ''); break;
      case '--out': opt.out = path.resolve(value()); break;
      case '--concurrency': opt.concurrency = toPosInt(value(), '--concurrency'); break;
      case '--help':
      case '-h': opt.help = true; break;
      default: throw new UsageError(`未知的選項: ${a}`);
    }
  }
  return opt;
}

function loadCases() {
  const list = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
  if (!Array.isArray(list)) throw new Error('cases.json 必須是陣列');
  for (const c of list) {
    if (!c.id || !c.case || typeof c.case.cc !== 'string') throw new Error(`病例格式錯誤（需要 id 與 case.cc）: ${JSON.stringify(c).slice(0, 80)}`);
  }
  return list;
}

function launchOptions() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return {};
  const u = new URL(raw);
  const proxy = { server: `${u.protocol}//${u.host}` };
  if (u.username) {
    proxy.username = decodeURIComponent(u.username);
    proxy.password = decodeURIComponent(u.password);
  }
  return { proxy };
}

async function fillCase(page, c) {
  for (const [key, id] of Object.entries(FIELD_IDS)) {
    const v = c[key];
    if (v === undefined || v === null || v === '') continue;
    if (SELECT_KEYS.has(key)) await page.selectOption(`#${id}`, { label: String(v) });
    else await page.fill(`#${id}`, String(v));
  }
  await page.check('#f-confirm');
}

// Reads the rendered result panel. Runs inside the page.
function extractResult() {
  const out = document.querySelector('#reasonOut');
  const cards = [...out.querySelectorAll('.dx-list > *')].map((c) => ({
    name: ((c.querySelector('.dx-name') || {}).textContent || '').trim(),
    must: [...c.querySelectorAll('.chip-flag')].some((x) => x.textContent.trim() === '必須排除'),
    text: c.textContent.replace(/\s+/g, ' ').trim(),
  }));
  const steps = [...out.querySelectorAll('.steps li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim());
  const critic = ((out.querySelector('.critic') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  const verdict = ((out.querySelector('.critic .chip') || {}).textContent || '').trim() || '(none)';
  const meta = ((out.querySelector('.round-head .meta') || {}).textContent || '').trim();
  const failed = [...out.querySelectorAll('.notice-flag')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /沒有完成/.test(t)).join(' / ');
  const av = document.querySelector('#availPanel');
  const availPanel = av && !av.hidden ? av.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return { cards, steps, critic, verdict, meta, failed, availPanel, all: out.textContent };
}

function scoreRun(caseDef, data) {
  const musts = data.cards.filter((c) => c.must);
  const expectations = ((caseDef.expect && caseDef.expect.must_rule_out) || []).map((e) => {
    const re = new RegExp(e.pattern, 'i');
    const idx = data.cards.findIndex((c) => re.test(c.name));
    const card = idx < 0 ? null : data.cards[idx];
    const marked = !!card && card.must;
    return {
      label: e.label,
      found: !!card,
      marked_must: marked,
      rank: marked ? `${musts.indexOf(card) + 1}/${musts.length}` : null,
      from_critic: !!card && card.text.includes('反方審查新增'),
      pass: !!card && marked,
    };
  });
  let bedsideOk = null;
  if (caseDef.expect && caseDef.expect.bedside) {
    const bre = new RegExp(caseDef.expect.bedside, 'i');
    bedsideOk = data.cards.some((c) => bre.test(c.text)) || data.steps.some((s) => bre.test(s));
  }
  const served = data.meta.includes('·') ? data.meta.split('·').pop().trim() : '';
  return {
    expectations,
    bedside_ok: bedsideOk,
    simplified: (data.all.match(SIMPLIFIED) || []).length,
    served_model: served || '(unknown)',
  };
}

// Used for runs that crashed before a result was read: every expectation counts as FAIL.
function failedExpectations(caseDef) {
  return ((caseDef.expect && caseDef.expect.must_rule_out) || []).map((e) => ({
    label: e.label, found: false, marked_must: false, rank: null, from_critic: false, pass: false,
  }));
}

async function runJob(browser, opts, caseDef, model, run) {
  const ctxOpts = { viewport: { width: 390, height: 844 } };
  if (model !== 'default') ctxOpts.extraHTTPHeaders = { 'x-ddx-model': model };
  const ctx = await browser.newContext(ctxOpts);
  const pageErrors = [];
  const started = Date.now();
  let secs = 0;
  let rec;
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(`${opts.site}/ddx`);
    await page.waitForTimeout(1200);
    await page.click('#btn-clear');
    await page.waitForTimeout(300);
    if (await page.isVisible('#btn-reset-yes')) await page.click('#btn-reset-yes');
    await fillCase(page, caseDef.case);
    await page.click('#btn-analyze');
    const t0 = Date.now();
    for (let k = 0; k < POLL_MAX; k++) {
      await page.waitForTimeout(POLL_MS);
      if (await page.$('#reasonOut .critic .chip')) break;
      if (await page.isVisible('#availPanel')) break;
      if (k > 8 && /沒有完成：/.test(await page.textContent('#reasonOut'))) break;
    }
    secs = Math.round((Date.now() - t0) / 1000);
    const data = await page.evaluate(extractResult);
    const scores = scoreRun(caseDef, data);
    const problems = [];
    if (data.failed) problems.push(data.failed);
    if (data.availPanel) problems.push(`availPanel: ${data.availPanel}`);
    if (data.verdict === '(none)') problems.push('no critic verdict');
    problems.push(...pageErrors);
    rec = {
      case: caseDef.id,
      source: caseDef.source,
      requested_model: model,
      served_model: scores.served_model,
      run,
      secs,
      scores: { expectations: scores.expectations, bedside_ok: scores.bedside_ok, simplified: scores.simplified },
      verdict: data.verdict,
      problems,
      meta: data.meta,
      cards: data.cards,
      steps: data.steps,
      critic: data.critic,
      failed: data.failed,
      raw_text: data.all,
      error: null,
    };
  } catch (e) {
    secs = Math.round((Date.now() - started) / 1000);
    const msg = (e && e.message ? e.message : String(e)).split('\n')[0];
    rec = {
      case: caseDef.id,
      source: caseDef.source,
      requested_model: model,
      served_model: '(error)',
      run,
      secs,
      scores: { expectations: failedExpectations(caseDef), bedside_ok: null, simplified: 0 },
      verdict: '(none)',
      problems: [`error: ${msg}`, ...pageErrors],
      meta: '',
      cards: [],
      steps: [],
      critic: '',
      failed: '',
      raw_text: '',
      error: msg,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
  const modelSafe = model.replace(/[^A-Za-z0-9]/g, '_');
  const file = path.join(opts.out, `${caseDef.id}__${modelSafe}__${run}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 1));
  return rec;
}

function formatRun(r) {
  const exps = r.scores.expectations.length
    ? r.scores.expectations.map((e) => {
      if (!e.pass) return `${e.label}:FAIL(${e.found ? `found, ${e.marked_must ? 'marked' : 'not marked'}` : 'not found'})`;
      return `${e.label}:PASS(${e.rank}${e.from_critic ? ', from critic' : ''})`;
    }).join('; ')
    : '-';
  const bs = r.scores.bedside_ok === null ? '-' : r.scores.bedside_ok ? 'yes' : 'no';
  const problems = r.problems.length ? r.problems.join(' / ') : 'none';
  return [r.case, r.served_model, r.run, r.secs, exps, `bedside ok: ${bs}`, `simplified chars: ${r.scores.simplified}`, r.verdict, problems].join(' | ');
}

function printSummary(results, cases, models) {
  console.log('\n== Summary (passes/total per case × requested model; errored runs count as FAIL) ==');
  for (const c of cases) {
    for (const m of models) {
      const group = results.filter((r) => r.case === c.id && r.requested_model === m);
      if (!group.length) continue;
      const served = [...new Set(group.map((r) => r.served_model))].join(', ');
      console.log(`${c.id} | model: ${m} | served: ${served} | runs: ${group.length}`);
      const labels = ((c.expect && c.expect.must_rule_out) || []).map((e) => e.label);
      for (const label of labels) {
        const passes = group.filter((r) => r.scores.expectations.some((e) => e.label === label && e.pass)).length;
        console.log(`  ${label}: ${passes}/${group.length}`);
      }
      if (c.expect && c.expect.bedside) {
        const ok = group.filter((r) => r.scores.bedside_ok === true).length;
        console.log(`  bedside (informational): ${ok}/${group.length}`);
      }
    }
  }
}

async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    console.error(USAGE);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  let cases = loadCases();
  if (opts.cases) {
    const unknown = opts.cases.filter((id) => !cases.some((c) => c.id === id));
    if (unknown.length) {
      console.error(`找不到病例: ${unknown.join(', ')}`);
      process.exit(2);
    }
    cases = cases.filter((c) => opts.cases.includes(c.id));
  }
  fs.mkdirSync(opts.out, { recursive: true });

  const jobs = [];
  for (const c of cases) for (const m of opts.models) for (let r = 1; r <= opts.runs; r++) jobs.push({ c, m, r });
  console.log(`共 ${jobs.length} 次執行，並行 ${Math.min(opts.concurrency, jobs.length)}，結果寫到 ${opts.out}`);
  console.log('case | model served | run | secs | expectations | bedside ok | simplified chars | verdict | problems');

  const browser = await chromium.launch(launchOptions());
  const results = [];
  try {
    await pool(jobs, opts.concurrency, async ({ c, m, r }) => {
      const rec = await runJob(browser, opts, c, m, r);
      results.push(rec);
      console.log(formatRun(rec));
    });
  } finally {
    await browser.close();
  }
  printSummary(results, cases, opts.models);
}

main().catch((e) => {
  console.error('CRASH:', e && e.stack ? e.stack : e);
  process.exit(1);
});
