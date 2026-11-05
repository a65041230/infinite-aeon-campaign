# Agent instructions

Read by OpenCode and Codex. Claude Code uses `.claude/` instead.

## Project

- Next.js 16 + React 19 + Tailwind 4 campaign site (`app/`, `src/`, `public/`).
- `video-edit/`: Python tools for beat-synced video edits (see its README). Media files are never committed.
- Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Rules for every agent

- Work only on what the task asks; keep diffs minimal and match the surrounding code style.
- Never read, print or commit `.env*`, keys, tokens or credentials.
- Never `git push`, `git reset`, `git clean`, install packages or delete files unless the task says so.
- Traditional Chinese (繁體中文) for user-facing copy unless the task says otherwise.
- End with a report: files changed, what you did, verification output, open questions.
  Never claim a check passed if you did not run it.

## When Claude is unavailable

If you are the main agent because Claude is out of quota: plan first with the `plan` agent,
keep each change small, run the checks above, and commit on a separate branch
(`ds/<topic>`) so Claude can review it later. Do not merge into the main branch yourself.
