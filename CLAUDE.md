# Working agreement

Project rules for all agents are in `AGENTS.md`; read it too.

## Delegate low-level work yourself — the user does not want to manage it

The user has authorized you to spawn subagents and delegate on your own, without asking first.
Default to delegating whenever a step is mechanical and you can describe it completely:

- **`haiku-worker` subagent**: codebase searches and file inventories, reading and summarising
  many files or logs, extracting frames / contact sheets / data, running checks and reporting,
  mechanical edits in ≤ 5 files with a clear spec. Run independent ones in parallel.
- **DeepSeek** (`delegate` skill, `node scripts/ds-task.mjs`): bulk or repetitive work — ≥ 10 files,
  test scaffolding, translations, long batch jobs — and everything implementable once the user says
  quota is low.
- **Yourself**: design, ambiguous requirements, debugging unclear failures, security or credential
  code, final user-facing copy, and the review of every worker's output.

Always review a worker's result before relying on it or reporting it; never pass along an
unverified claim. Mention delegation in one line of your final summary — no play-by-play.
