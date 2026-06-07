# rebuild216 — agentic delivery CLI

Runs Claude Code autonomously on a project's tickets: it implements each ticket,
moves it through the workflow (TODO → IN_PROGRESS → IN_REVIEW → DONE), commits
per step, and **never pushes** until you say so.

## One-time setup (on your machine)

```bash
# 1. Auth Claude Code with your Anthropic account (subscription, not an API key)
claude login

# 2. Install the CLI engine + MCP SDK (kept out of the web app deps on purpose)
cd next-app
npm i @anthropic-ai/claude-agent-sdk @modelcontextprotocol/sdk

# 3. (optional) point at your deployment + a GitHub token for clone/push
export REBUILD_URL=https://next-app-maaref.vercel.app
export GITHUB_TOKEN=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
# 4. make it runnable
npm link        # or: node cli/rebuild216.mjs ...
```

## Usage

```bash
rebuild216 login                 # prompts email + password (masked), stores a token
rebuild216                       # lists your projects → pick one → choose a mode
rebuild216 "Project Name"        # named project → choose a mode
rebuild216 chat ["Project Name"] # skip the menu, go straight to chat + MCP
```

After you pick a project the CLI clones it and asks **how you want to work**:

1. **Autonomous delivery** — Claude works through the open tickets on its own.
2. **Chat with Claude Code (+ rebuild MCP)** — discuss, plan, ask questions, and
   have it act on request. It can read/edit files, run commands, and use the
   rebuild MCP tools (read/update tickets). It's a real multi-turn conversation.

Either way you land in the same interactive session afterwards.

When you run it, the CLI clones the project's repo and writes the REBUILD
context into `.rebuild/` inside the clone:

- `SOUL.md` / `SKILLS.md` — the agent's identity + conventions (edited from the admin panel)
- `WORKFLOW.md` — how to move tickets through the workflow via the MCP tools
- `TICKETS.md` — every ticket with its description and status
- `docs/` — textual workspace documents (specs, briefs)

The agent reads that context, then uses the **rebuild** MCP server to read
tickets and update their status, committing locally per ticket. Nothing is pushed.

## At the end

You drop into a prompt:

```
you> can you add a rate-limit to the login route?   # chat — Claude reads, edits, commits locally
you> /run        # autonomous pass over the open tickets
you> /status     # git status
you> /log        # recent commits
you> /push       # push all commits to the remote (only now)
you> /quit
```

In the session, **plain text is a chat message** to Claude Code (multi-turn,
with the rebuild MCP tools available); slash commands control git/push/run.

## How it works

- `rebuild216 login` → `POST /api/cli/login` → stores a Supabase token in `~/.rebuild216/config.json`.
- `rebuild216` (no arg) → `GET /api/cli/projects` (Bearer) → numbered picker.
- `rebuild216 <project>` → `GET /api/cli/context` (Bearer) → `{ workspace, repo, tickets, agentDocs, documents }`.
- Clones `owner/repo`, writes `.rebuild/{SOUL,SKILLS,WORKFLOW,TICKETS}.md` + `docs/`, installs a `pre-push` git hook that **blocks push**.
- Launches Claude Code (`@anthropic-ai/claude-agent-sdk`) with:
  - the **rebuild** MCP server (`list_tickets`, `update_ticket_status`, `add_comment` → `POST /api/cli/ticket`),
  - `Bash` for git commits (push blocked), `Read`/`Edit`/`Write` for code,
  - a system prompt enforcing the workflow + a verify gate (typecheck/tests) before DONE.
- `/push` removes the hook and pushes.

## Security notes

- Token-based (no password in argv). Token stored `chmod 600`.
- Push is blocked by a git `pre-push` hook until `/push`.
- The agent runs in `bypassPermissions` (autonomous). Run it on repos you trust;
  it cannot push, delete the repo is discouraged by the prompt, but review the
  diff before `/push`.
