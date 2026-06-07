# Skills — how you work

This is the playbook for delivering tickets on a REBUILD project. Read it, then
read the actual repo before assuming anything — these are defaults; the project's
own README, package.json scripts, and conventions always win.

## Orient first (before touching code)
1. Read `.rebuild/TICKETS.md` and the docs in `.rebuild/docs/` for context.
2. Inspect the repo: `package.json` (scripts + deps), the framework, the folder
   layout, the test setup, the lint config. Detect the stack — do not assume it.
3. Find 2–3 files near the ticket's area and mirror their style.

## Stack defaults (typical REBUILD web project)
- **Next.js (App Router) + React + TypeScript**, Tailwind + shadcn/ui for UI.
- **Supabase** for data/auth (`@supabase/ssr`; a service-role client server-side).
- **Anthropic** for AI features — default model `claude-opus-4-8`, adaptive
  thinking. Never hardcode an API key; read it from the environment.
- **Octokit** for any GitHub integration.
- **Vitest** for tests.
> If the repo differs, follow the repo. This list tells you what's *likely*, not
> what's *true*.

## Commands (run them — don't guess the result)
Discover the real scripts in `package.json`, then use them. Common ones:
- `npm run typecheck` — must be clean before any commit.
- `npm run lint` — fix what you introduce.
- `npm test` — the verification gate; tests must pass before DONE.
- `npm run build` — run for changes that could affect the build.
Install deps with the project's lockfile manager (`npm ci` / `pnpm i` / `yarn`).

## Coding conventions
- **Zero mock / seed / fallback.** Real data paths only. No fake responses, no
  `if (dev) return sampleData`. If a dependency (DB, API key) is missing, fail
  loudly with a clear error — don't paper over it.
- **TypeScript strict.** No `any` to silence the compiler; type it properly.
- **Match surrounding style** — naming, imports ordering, comment density. Add a
  comment only where intent isn't obvious from the code.
- **No new dependency** unless the ticket needs it and there's no in-repo
  equivalent. Prefer the libraries already present.
- **Security:** never commit secrets; read config from env. Respect existing
  auth/RBAC checks — never weaken a guard to make a feature "work".

## Per-ticket workflow (via the `rebuild` MCP tools)
1. `list_tickets` → pick the next non-DONE ticket.
2. `update_ticket_status(id, "IN_PROGRESS")`.
3. Implement the change. Keep the diff focused on this ticket only.
4. **Verify:** typecheck + tests (+ build if relevant). Fix until green. If you
   genuinely cannot make it green, leave the ticket in `IN_PROGRESS`, add a
   comment explaining the blocker, and move on — do not mark it DONE.
5. `git add -A && git commit -m "type: summary [SHORT-ID]"` — Conventional
   Commit style, referencing the ticket short id. **Never `git push`.**
6. `update_ticket_status(id, "IN_REVIEW")` → then `"DONE"` once verified.
7. `add_comment(id, "<what changed, what was verified>")`.

## Definition of Done
- Code implements the ticket's intent, with no mocks/placeholders.
- `typecheck` clean, `test` passing, `lint` clean for touched files.
- Exactly one focused commit, message references the ticket short id.
- A status of DONE and a comment summarising the change.
- Nothing pushed — the human reviews and pushes via `/push`.
