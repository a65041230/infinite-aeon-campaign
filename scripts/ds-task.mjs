#!/usr/bin/env node
// Delegate one task to DeepSeek through OpenCode, isolated in its own git worktree.
//
//   node scripts/ds-task.mjs run <name> <task.md> [--model provider/model] [--timeout 1800]
//   node scripts/ds-task.mjs status
//   node scripts/ds-task.mjs clean <name>
//
// The worker edits .worktrees/ds-<name> on branch ds/<name>; nothing touches your
// checkout until you review and merge that branch. Untracked files such as .env are
// not copied into the worktree, so the worker never sees them.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MODEL = "deepseek/deepseek-flash";
const isWin = process.platform === "win32";
const opencodeBin = process.env.OPENCODE_BIN || "opencode";

function git(args, opts = {}) {
  const r = spawnSync("git", args, { encoding: "utf8", ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    die(`git ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  }
  return (r.stdout || "").trim();
}

function die(msg) {
  console.error(`ds-task: ${msg}`);
  process.exit(1);
}

function parseFlags(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

// Windows needs a shell to launch opencode.cmd, so quote arguments ourselves.
function winQuote(a) {
  return /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{30,}/,
];

const root = git(["rev-parse", "--show-toplevel"]);
const wtDir = path.join(root, ".worktrees");
const [cmd, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

if (cmd === "run") runTask();
else if (cmd === "status") status();
else if (cmd === "clean") clean();
else {
  console.log(`usage:
  node scripts/ds-task.mjs run <name> <task.md> [--model ${DEFAULT_MODEL}] [--timeout 1800]
  node scripts/ds-task.mjs status
  node scripts/ds-task.mjs clean <name>`);
  process.exit(cmd ? 1 : 0);
}

function paths(name) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name || "")) {
    die("name must be lowercase letters, digits and dashes (e.g. add-tests)");
  }
  return {
    wt: path.join(wtDir, `ds-${name}`),
    log: path.join(wtDir, `ds-${name}.log`),
    branch: `ds/${name}`,
  };
}

function runTask() {
  const [name, taskFile] = flags._;
  const { wt, log, branch } = paths(name);
  if (!taskFile || !fs.existsSync(taskFile)) die(`task file not found: ${taskFile}`);
  const task = fs.readFileSync(taskFile, "utf8");
  for (const re of SECRET_PATTERNS) {
    if (re.test(task)) die(`task file looks like it contains a secret (${re}); remove it first`);
  }
  if (fs.existsSync(wt)) die(`${wt} already exists; review it or run: node scripts/ds-task.mjs clean ${name}`);
  const model = flags.model || DEFAULT_MODEL;
  if (!/^(deepseek|opencode)\//.test(model)) {
    console.warn(`ds-task: warning: ${model} is not a DeepSeek/OpenCode model`);
  }
  const which = spawnSync(isWin ? "where" : "which", [opencodeBin], { encoding: "utf8" });
  if (which.status !== 0 && !process.env.OPENCODE_BIN) {
    die("opencode not found; install it with: npm install -g opencode-ai");
  }

  fs.mkdirSync(wtDir, { recursive: true });
  git(["worktree", "add", "-b", branch, wt, "HEAD"]);
  const nm = path.join(root, "node_modules");
  if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(wt, "node_modules"), "junction");
  fs.writeFileSync(path.join(wt, ".ds-task.md"), task);

  const args = [
    "run", "--agent", "worker", "-m", model, "--dir", wt, "--title", `ds-${name}`,
    "-f", ".ds-task.md",
    "Complete the task described in the attached file .ds-task.md. Follow AGENTS.md. End with the report it asks for.",
  ];
  const timeoutSec = Number(flags.timeout || 1800);
  console.log(`ds-task: ${branch} -> ${model} (timeout ${timeoutSec}s, log ${path.relative(root, log)})`);

  const logStream = fs.createWriteStream(log);
  const child = isWin
    ? spawn([opencodeBin, ...args].map(winQuote).join(" "), { cwd: wt, shell: true })
    : spawn(opencodeBin, args, { cwd: wt });
  const timer = setTimeout(() => {
    console.error(`\nds-task: timed out after ${timeoutSec}s, stopping worker`);
    child.kill();
  }, timeoutSec * 1000);
  for (const [src, dst] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    src.on("data", (d) => { dst.write(d); logStream.write(d); });
  }
  child.on("error", (e) => die(`could not start opencode: ${e.message}`));
  child.on("close", (code) => {
    clearTimeout(timer);
    logStream.end();
    fs.rmSync(path.join(wt, ".ds-task.md"), { force: true });
    console.log(`\nds-task: worker exited with ${code}. Changes on ${branch}:`);
    console.log(git(["-C", wt, "status", "--short"]) || "  (no changes)");
    const stat = git(["-C", wt, "diff", "--stat"]);
    if (stat) console.log(stat);
    process.exit(code ?? 1);
  });
}

function status() {
  const out = git(["worktree", "list", "--porcelain"]);
  const wts = out.split("\n\n").map((b) => b.match(/^worktree (.+)$/m)?.[1])
    .filter((p) => p && path.basename(p).startsWith("ds-"));
  if (!wts.length) return console.log("no delegated tasks");
  for (const p of wts) {
    const changed = git(["-C", p, "status", "--short"]).split("\n").filter(Boolean).length;
    console.log(`${path.basename(p).slice(3).padEnd(30)} ${changed} changed file(s)  ${path.relative(root, p)}`);
  }
}

function clean() {
  const { wt, log, branch } = paths(flags._[0]);
  // Remove the node_modules link first so nothing can recurse into the real folder.
  const link = path.join(wt, "node_modules");
  try {
    if (fs.lstatSync(link, { throwIfNoEntry: false })) {
      try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }
    }
  } catch (e) {
    die(`could not remove ${link} (${e.message}); delete that link by hand, then re-run clean`);
  }
  git(["worktree", "remove", "--force", wt], { allowFail: true });
  git(["branch", "-D", branch], { allowFail: true });
  fs.rmSync(log, { force: true });
  console.log(`removed ${branch}`);
}
