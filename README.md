<div align="center">

# REBUILD Engineering OS

**The internal engineering platform for the REBUILD software agency.**
Projects, tickets, sprints, a GitHub-backed in-browser IDE, AI assistance, a
client portal, and an agentic delivery CLI — in one place.

Next.js 16 · React 19 · TypeScript · Supabase · Anthropic Claude · Octokit

</div>

---

## What it is

REBUILD Engineering OS runs the agency's delivery end to end:

- **Workspaces & projects** — multi-team structure with per-workspace GitHub repos.
- **Tickets & board** — Kanban + backlog, sprints, milestones, epics & sub-tasks,
  linked issues, story points, labels, custom fields, time tracking, and a full
  activity log.
- **In-browser IDE** — a real file explorer, Monaco editor, branch switching,
  drag-and-drop moves, file/folder create & delete — **every change is a real
  GitHub commit** (via the Contents API). Live presence & cursors over realtime.
- **Pull requests & reviews** — PR list, review states, an approval/merge gate.
- **AI layer (Claude `claude-opus-4-8`)** — documentation generation, standups,
  triage, changelogs, project summaries, and review assistance.
- **CRM, finance & admin** — leads → conversion, devis/factures, charges &
  revenus, user & role management, and editable agent docs (`soul`/`skills`/
  `architecture`).
- **Client portal** — token-signed read access for clients.
- **`rebuild216` CLI** — an agentic delivery tool that runs Claude Code on a
  project's tickets (see [cli/README.md](cli/README.md)).

## Tech stack

| Layer | Choice |
|------|--------|
| Framework | **Next.js 16** (App Router, RSC) + **React 19** |
| Language | **TypeScript** (strict) |
| UI | **Tailwind v4** + **shadcn/ui** + **GSAP** motion |
| Editor | **Monaco** + **xterm** |
| Data / Auth | **Supabase** (`@supabase/ssr` + service-role server client) |
| AI | **Anthropic** `@anthropic-ai/sdk` — `claude-opus-4-8` |
| Git | **Octokit** (`@octokit/rest`) |
| Realtime | In-process SSE bus + optional Supabase Realtime bridge |
| Tests | **Vitest** (unit) · **Playwright** (e2e) |
| Hosting | **Vercel** |

## Architecture

```
app/                Routes (App Router). Server Components by default;
  (app)/            authenticated product surface (dashboard, workspace, admin…)
  (auth)/           sign-in / sign-up
  api/              route handlers (git, ai, cli, webhooks, cron, …)
components/         UI — components/ui is the shadcn primitive layer
lib/                The brains: data access, auth/RBAC, integrations, pure helpers
hooks/              Client hooks (realtime, …)
supabase/           SQL schema + migrations (run against your Postgres)
cli/                The standalone rebuild216 CLI (+ MCP server)
scripts/            Build helpers (e.g. sync-cli)
tests/              Vitest suites for the extracted pure logic
```

**Layering rule:** routes & server components → `lib/` → Supabase / GitHub /
Anthropic. UI and route handlers never call those services directly; they go
through the `lib/` function that owns the concern. Authorization is centralized
in `lib/auth` (RBAC matrix + per-workspace guards).

## Getting started

### 1. Prerequisites
- Node.js ≥ 18 (built on Node 26)
- A Supabase project (Postgres + Auth)
- Optional: a GitHub token, an Anthropic API key

### 2. Install
```bash
npm install
```

### 3. Configure environment
Copy `.env.example` to `.env.local` and fill in the values:
```bash
cp .env.example .env.local
```
Minimum to boot with real data:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server only — never commit
ANTHROPIC_API_KEY=...                # for the AI features
GITHUB_TOKEN=...                     # for live repo / PR / IDE
GITHUB_DEFAULT_ORG=Rebuild-main-org
BOOTSTRAP_ADMINS=you@example.com     # granted ADMIN on sign-in
```
> `.env*` is git-ignored. The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — keep it
> server-side only and rotate it if it ever leaks.

### 4. Set up the database
Run the SQL against your Postgres (Supabase SQL editor or `psql`):
```bash
psql "$DATABASE_URL" -f supabase/all.sql   # schema + auth + migrations, combined
```
Individual files live in `supabase/` (schema, auth, roles, time-tracking,
agent-docs, …) if you prefer to run them piecemeal.

### 5. Run
```bash
npm run dev          # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (runs `prebuild` → syncs the CLI to `public/cli`) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest (unit) |
| `npm run e2e` | Playwright |

## The `rebuild216` CLI

An agentic delivery CLI: it clones a project's repo, loads the REBUILD context
(`soul` / `skills` / `architecture` / tickets / docs), and runs **Claude Code**
either autonomously over the open tickets **or** in an interactive chat — with a
`rebuild` MCP server to read, create, and update tickets on the board. It commits
locally per step and **never pushes until you type `/push`**.

```bash
curl -fsSL https://next-app-maaref.vercel.app/cli/install.sh | sh
rebuild216 login
rebuild216                 # pick a project → choose autonomous or chat
```

Full docs: [cli/README.md](cli/README.md).

## Security

- **No secrets in git.** `.env*` is ignored; configuration comes from the
  environment. The service-role key is server-only.
- **Centralized RBAC** with per-workspace effective roles; mutations are rate-
  limited and audited.
- **Push is explicit** in the CLI — a `pre-push` git hook blocks pushes until the
  human runs `/push`.

## Deployment

Deployed on **Vercel**. The `prebuild` step syncs the CLI into `public/cli` so
the one-line installer is served from the deployment. Set the same environment
variables in the Vercel project settings.

---

<div align="center">
<sub>Built by REBUILD. Internal platform — not a SaaS.</sub>
</div>
