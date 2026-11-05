---
name: delegate
description: Decide what to do yourself, what to hand to the Haiku subagent, and what to offload to DeepSeek through OpenCode, then review and merge the result. Use for bulk or repetitive work (many files, batch edits, test writing, translations, data/media processing), when the user says quota is low (額度不夠, 省額度, 額度快用完), or when they ask to delegate / 派工 / 分給 DeepSeek.
---

# Delegating work

You (Claude, on the user's subscription) are the lead: you plan, write specs, review and merge.
Workers never merge their own work.

| Worker | How | Use for | Cost |
|---|---|---|---|
| You | directly | design, debugging, security-sensitive code, anything ambiguous, final review | subscription |
| `haiku-worker` subagent | Agent tool, `subagent_type: haiku-worker` | small specced tasks, codebase search, summaries, frame/data extraction | subscription (cheap) |
| DeepSeek via OpenCode | `node scripts/ds-task.mjs run <name> <task.md>` | bulk mechanical work: ≥ 10 files, repetitive edits, test scaffolding, translations, long batch jobs | DeepSeek API, not subscription |

## Modes

- **Normal** (default): do the thinking yourself, send small tasks to `haiku-worker`, send bulk work to DeepSeek.
- **Economy** (the user says quota is low, or you see usage-limit warnings): send *all* implementation
  to DeepSeek. Spend your own turns only on specs and on reviewing `git diff --stat` plus the hunks that
  matter; don't read whole files you don't need. Batch several small tasks into one spec.
- **Out of quota**: you are not running. The user runs `opencode` in the repo directly (DeepSeek, see
  `AGENTS.md`). When you are back, list `ds/*` branches and review them like any delegated task.

Never delegate: secrets/credentials, auth or payment code, security fixes, schema or architecture
decisions, or anything the user asked you personally to do. Never put secrets, customer data or `.env`
contents in a task file (the script refuses obvious keys, but don't rely on it).

## Delegating to DeepSeek

1. Write the spec from `task-template.md` to a file outside the repo or under `.worktrees/`
   (ignored). It must stand alone: the worker sees only the repo and this file.
2. Run `node scripts/ds-task.mjs run <name> <spec.md>` (Bash, background for long tasks).
   It creates `.worktrees/ds-<name>` on branch `ds/<name>`; `.env` and other untracked files are not there.
   Default model `deepseek/deepseek-flash`; `--model opencode/deepseek-v4.1-flash-free` for throwaway,
   non-sensitive drafts (free models may log data).
3. Review in the worktree: `git -C .worktrees/ds-<name> diff`, run the checks from `AGENTS.md`
   there, and confirm the worker only touched the files the spec allowed.
4. Accept: `git -C .worktrees/ds-<name> add -A && git -C .worktrees/ds-<name> commit -m "<message>"`,
   then `git merge --no-ff ds/<name>` on the working branch and `node scripts/ds-task.mjs clean <name>`.
   Reject: send a second spec with concrete feedback (re-run under a new name after cleaning).
   **Two rejections on the same task → do it yourself.**
5. Tell the user what was delegated, what you changed during review, and what you verified.

## Delegating to haiku-worker

Same spec discipline, passed in the Agent prompt instead of a file. Review its edits with `git diff`
before continuing. Prefer it over DeepSeek when the task needs repo context you can point to in a
few lines, or when it is read-only.

## If DeepSeek is unavailable

If `ds-task.mjs` fails (opencode missing, no `DEEPSEEK_API_KEY`, API errors), say so plainly, then
either do the task yourself or ask the user whether to wait. Don't silently switch models.
