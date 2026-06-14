#!/usr/bin/env node
// rebuild216 — agentic delivery CLI.
//
//   rebuild216 login                 # store a token (no password in argv)
//   rebuild216 <project_name>        # run Claude Code on the project's tickets
//
// Auth: token (from `login`), NOT password-in-args.
// Engine: Claude Code via @anthropic-ai/claude-agent-sdk using your Anthropic
//         account login (run `claude login` first) — no API key needed.
// Git:    commits per step; push is BLOCKED until you type /push at the end.
//
// Requires (on your machine):  npm i  (deps below) + `claude login`
//   @anthropic-ai/claude-agent-sdk   @modelcontextprotocol/sdk
//
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const URL_BASE = process.env.REBUILD_URL || "https://next-app-maaref.vercel.app"
const CFG_DIR = path.join(os.homedir(), ".rebuild216")
const CFG = path.join(CFG_DIR, "config.json")
const MCP = path.join(HERE, "mcp-rebuild.mjs")

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
}

function loadCfg() {
  try {
    return JSON.parse(fs.readFileSync(CFG, "utf8"))
  } catch {
    return null
  }
}
function saveCfg(cfg) {
  fs.mkdirSync(CFG_DIR, { recursive: true })
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a.trim()))))
}
// Hidden input for the password (no echo). Falls back to a visible prompt where
// raw mode isn't available (Git Bash / MSYS / non-TTY stdin on Windows).
function promptHidden(q) {
  const stdin = process.stdin
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    console.log(c.dim("(this terminal can't mask input — your password will be visible)"))
    return prompt(q)
  }
  return new Promise((res) => {
    process.stdout.write(q)
    let buf = ""
    const onData = (ch) => {
      const s = ch.toString("utf8")
      if (s === "\n" || s === "\r") {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener("data", onData)
        process.stdout.write("\n")
        res(buf)
      } else if (s === "\u0003") {
        process.stdout.write("\n")
        process.exit(1)
      } else if (s === "\u007f" || s === "\b") {
        buf = buf.slice(0, -1)
      } else {
        buf += s
      }
    }
    try {
      stdin.setRawMode(true)
    } catch {
      console.log(c.dim("\n(masking unavailable — your password will be visible)"))
      prompt(q).then(res)
      return
    }
    stdin.resume()
    stdin.on("data", onData)
  })
}

async function api(p, init = {}, token) {
  const res = await fetch(`${URL_BASE}${p}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const txt = await res.text()
  const data = txt ? JSON.parse(txt) : {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// Exchange the stored refresh token for a fresh access token and persist it.
// Supabase access tokens are short-lived; long sessions outlive them.
async function refreshCfg(cfg) {
  if (!cfg?.refreshToken) return false
  try {
    const data = await api("/api/cli/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: cfg.refreshToken }),
    })
    if (!data.token) return false
    cfg.token = data.token
    if (data.refreshToken) cfg.refreshToken = data.refreshToken
    saveCfg(cfg)
    return true
  } catch {
    return false
  }
}

// Upgrade an old short-lived (JWT) session to a non-expiring CLI token so long
// runs never get logged out. No-op once the stored token is already a CLI token.
async function ensurePersistentToken(cfg) {
  if (!cfg?.token || cfg.token.startsWith("rbld_")) return
  try {
    const data = await apiAuth("/api/cli/token", { method: "POST" }, cfg)
    if (data?.cliToken) {
      cfg.token = data.cliToken
      saveCfg(cfg)
    }
  } catch {
    /* server may be older; keep the JWT + refresh fallback */
  }
}

// Authenticated call that refreshes the token once on 401 and retries.
async function apiAuth(p, init, cfg) {
  try {
    return await api(p, init, cfg.token)
  } catch (e) {
    if (/Unauthorized|HTTP 401/i.test(e.message) && (await refreshCfg(cfg))) {
      return await api(p, init, cfg.token)
    }
    throw e
  }
}

async function cmdLogin() {
  console.log(c.bold("rebuild216 login") + c.dim(`  (${URL_BASE})`))
  const email = await prompt("Email: ")
  const password = await promptHidden("Password: ")
  try {
    const r = await api("/api/cli/login", { method: "POST", body: JSON.stringify({ email, password }) })
    // Prefer the non-expiring CLI token so long agent runs never get logged out;
    // keep the refresh token as a fallback for older servers.
    saveCfg({ url: URL_BASE, token: r.cliToken || r.token, refreshToken: r.refreshToken, email: r.user?.email })
    console.log(c.green(`✓ Logged in as ${r.user?.email}. Token saved to ${CFG}`))
    if (!r.cliToken) console.log(c.yellow("  (server returned a short-lived token; long runs may expire — update the server)"))
  } catch (e) {
    console.error(c.red(`✗ Login failed: ${e.message}`))
    process.exit(1)
  }
}

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" })
}

// process.cwd() throws EPERM/ENOENT when the shell's directory was removed
// (e.g. a previous -ops run deleted & recreated it, leaving a stale inode).
// Fall back to the home directory so the CLI keeps working.
function safeCwd() {
  try {
    return process.cwd()
  } catch {
    const home = os.homedir()
    try {
      process.chdir(home)
    } catch {
      /* best effort */
    }
    console.log(c.yellow(`⚠ Current directory is unavailable — using ${home} instead.`))
    return home
  }
}

function cloneRepo(repo, workDir) {
  const token = process.env.GITHUB_TOKEN
  if (!repo.includes("/")) {
    throw new Error(
      `The workspace repo "${repo}" is missing its owner (expected "owner/name"). Set the workspace's GitHub repo to e.g. "Rebuild-main-org/${repo}".`
    )
  }
  const url = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`
  if (fs.existsSync(path.join(workDir, ".git"))) {
    git(["pull", "--ff-only"], workDir)
    return
  }
  fs.mkdirSync(path.dirname(workDir), { recursive: true })
  const r = spawnSync("git", ["clone", url, workDir], { encoding: "utf8", stdio: "inherit" })
  if (r.status !== 0) {
    const hint = token
      ? `Check that https://github.com/${repo} exists and your GITHUB_TOKEN can access it.`
      : `If it's private, set GITHUB_TOKEN. Check that https://github.com/${repo} exists.`
    throw new Error(`git clone failed for ${repo}. ${hint}`)
  }
}

// One repo per workspace, one branch per project. Check out (or create) the
// project's branch so each project's work lives on its own branch.
function checkoutProjectBranch(workDir, branch) {
  if (!branch) return null
  const current = (git(["rev-parse", "--abbrev-ref", "HEAD"], workDir).stdout || "").trim()
  if (current === branch) {
    git(["pull", "--ff-only"], workDir) // already on it — fast-forward
    return branch
  }
  const ls = git(["ls-remote", "--heads", "origin", branch], workDir)
  const onRemote = (ls.stdout || "").includes(`refs/heads/${branch}`)
  if (onRemote) {
    git(["fetch", "origin", branch], workDir)
    git(["checkout", "-B", branch, "FETCH_HEAD"], workDir)
  } else {
    // New project branch off the current (default) branch.
    git(["checkout", "-B", branch], workDir)
  }
  return branch
}

// Remote branch names (without the "origin/" prefix), excluding HEAD.
function remoteBranches(workDir) {
  const out = git(["branch", "-r", "--format=%(refname:short)"], workDir).stdout || ""
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((b) => b && b !== "origin/HEAD" && !b.includes("->"))
    .map((b) => b.replace(/^origin\//, ""))
}

// Hard block on push during the agent phase (removed by /push).
function setPushBlock(repoDir, blocked) {
  const hook = path.join(repoDir, ".git", "hooks", "pre-push")
  if (blocked) {
    fs.writeFileSync(hook, "#!/bin/sh\necho 'rebuild216: push disabled until /push' >&2\nexit 1\n", { mode: 0o755 })
  } else {
    try {
      fs.unlinkSync(hook)
    } catch {
      /* none */
    }
  }
}

// The workflow guide written into the clone (.rebuild/WORKFLOW.md) and passed to
// the agent. Explains how to interact with the REBUILD workflow via MCP.
const WORKFLOW = `# REBUILD delivery workflow

You are working autonomously inside a cloned **workspace** repository. The
workspace has one git repo; each project lives on its own branch. You have
already been checked out onto this project's branch — stay on it: commit all
work here and never switch or create other branches. Deliver the open tickets
one at a time. Use the **rebuild** MCP tools to read tickets and move them
through the workflow; commit your work locally per ticket.

## Populating a backlog
If the project has no tickets and the user asks you to create/fill tasks, use
\`create_ticket\` to add real, fully-populated tickets to the board. Fill every
field that makes sense, not just the title:
- **description** — markdown with context + acceptance criteria (what "done" means)
- **type** and **priority** — chosen deliberately
- **points** — a story-point estimate
- **labels** — relevant tags
- **parentShortId** — break large items into sub-tasks of an epic/parent
- **links** — connect dependencies (BLOCKS / RELATES / DUPLICATES)
- **assignee** — when the user names an owner ("me" or an email)
Sequence them sensibly (e.g. create an epic, then its sub-tasks referencing its
short id). Propose a coherent backlog for the project's goal — never invent fake
or filler tickets just to fill space, and never mark anything DONE that isn't
actually implemented and verified.

## Per-ticket loop
1. \`list_tickets\` — see what's left. Skip tickets already DONE.
2. \`update_ticket_status(ticketId, "IN_PROGRESS")\` before you start a ticket.
3. Implement the change in the repo. Keep the diff focused on that one ticket.
4. Verify: run the project's typecheck and tests (e.g. \`npm run typecheck && npm test\`).
   Fix until green. Do not mark a ticket DONE if verification fails.
4b. **Visual evidence (web apps)**: after tests pass, if the project is a web app,
   start its dev server in the background (e.g. \`npm run dev\` &, wait until it
   responds), then call \`capture_screenshots({ baseUrl, routes, label })\` with the
   pages exercised by this ticket's workflow (e.g. the routes you changed/added).
   The screenshots are uploaded to the project's Documents automatically. Stop the
   dev server afterwards. If the project isn't a web app, skip this step.
5. \`git add -A && git commit\` with a message referencing the short id and a
   trailer marking it as agent-delivered, e.g.
   \`feat: add login rate-limit [ACME-142]\` followed by a blank line and the
   trailer \`rebuild216-agent: true\`. **Never \`git push\`** — it is blocked.
6. \`update_ticket_status(ticketId, "IN_REVIEW")\`, then \`"DONE"\` once verified.
   \`add_comment(ticketId, "<short summary of what you did>")\`.

## Hard rules
- Never run \`git push\` (a pre-push hook blocks it; the human pushes via /push).
- Never delete the repository or run destructive shell commands.
- One commit per ticket; descriptive messages with the ticket short id.
- Read \`.rebuild/SOUL.md\`, \`.rebuild/SKILLS.md\` and \`.rebuild/ARCHITECTURE.md\`
  first — they define who you are, the conventions you must follow, and the system
  architecture you must respect. Read \`.rebuild/docs/\` for project specs.
- Stop when every ticket is DONE.`

function buildSystem(ctx) {
  const soul = ctx.agentDocs?.soul?.trim()
  const skills = ctx.agentDocs?.skills?.trim()
  const architecture = ctx.agentDocs?.architecture?.trim()
  return [
    soul ? `# Who you are (soul.md)\n${soul}` : "",
    skills ? `# How you work (skills.md)\n${skills}` : "",
    architecture ? `# System architecture (architecture.md)\n${architecture}` : "",
    WORKFLOW,
    "# Contrats & doctrine partagés (à respecter)\nLis et applique les fichiers de `.rebuild/agent_contracts/` (ticket, PR, revue, glossaire), `.rebuild/skills/` (procédures, chargées à la demande) et `.rebuild/doctrine/` (SOUL, WORKFLOW, conditions d'arrêt & portes de vérification). En cas de conflit, ces contrats font foi.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

// Decode a base64 data URL to a Buffer (returns null if not a data URL).
function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]*);base64,(.*)$/s.exec(dataUrl || "")
  if (!m) return null
  return { mime: m[1], buf: Buffer.from(m[2], "base64") }
}

const TEXTUAL = /^(text\/|application\/(json|xml|x-yaml|markdown)|.*\+(json|xml)$)/

// Write the agent context into the clone: .rebuild/{SOUL,SKILLS,WORKFLOW,TICKETS}.md
// and textual workspace documents into .rebuild/docs/.
async function writeContext(workDir, ctx, token) {
  const dir = path.join(workDir, ".rebuild")
  const docsDir = path.join(dir, "docs")
  fs.mkdirSync(docsDir, { recursive: true })

  // Shared doctrine + modular skills + contracts (from the server). Additive:
  // written under .rebuild/{doctrine,skills,agent_contracts}/ — never clobbers
  // the live context files below.
  for (const f of ctx.sharedDocs || []) {
    const safe = String(f.path).replace(/\.\.+/g, "").replace(/^\/+/, "")
    if (!safe) continue
    const dest = path.join(dir, safe)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, (f.content ?? "") + "\n")
  }

  fs.writeFileSync(path.join(dir, "WORKFLOW.md"), WORKFLOW + "\n")
  if (ctx.agentDocs?.soul) fs.writeFileSync(path.join(dir, "SOUL.md"), ctx.agentDocs.soul + "\n")
  if (ctx.agentDocs?.skills) fs.writeFileSync(path.join(dir, "SKILLS.md"), ctx.agentDocs.skills + "\n")
  if (ctx.agentDocs?.architecture)
    fs.writeFileSync(path.join(dir, "ARCHITECTURE.md"), ctx.agentDocs.architecture + "\n")

  // The workspace's selected agents (Super Admin library): write each agent's
  // files into .rebuild/agent/<agentName>/ (UI templates, languages, rules,
  // knowledge, configs…). Supports multiple agents per workspace.
  const agentList = ctx.agents || (ctx.agent ? [ctx.agent] : [])
  let agentFiles = 0
  const agentNames = []
  if (agentList.length) {
    const agentDir = path.join(dir, "agent")
    fs.mkdirSync(agentDir, { recursive: true }) // ensure it exists even if agents have no files
    const manifest = ["# Injected agents", ""]
    for (const agent of agentList) {
      agentNames.push(agent.name)
      const folder = String(agent.name).replace(/[^\w.\- ]+/g, "_") || "agent"
      manifest.push(`## ${agent.name}`)
      for (const f of agent.files || []) {
        const safe = String(f.name).replace(/\.\.+/g, "").replace(/^\/+/, "")
        const dest = path.join(agentDir, folder, safe)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, (f.content ?? "") + "\n")
        manifest.push(`- \`${folder}/${safe}\` (${f.kind})`)
        agentFiles++
      }
      manifest.push("")
    }
    fs.writeFileSync(path.join(agentDir, "INDEX.md"), manifest.join("\n") + "\n")
  }

  const ticketsMd = [
    `# Tickets — ${ctx.project.name} (${ctx.project.shortCode})`,
    "",
    ...ctx.tickets.map(
      (t) => `## [${t.shortId}] ${t.title}  · ${t.type}/${t.priority} · ${t.status}\n${t.description || "_no description_"}`
    ),
  ].join("\n")
  fs.writeFileSync(path.join(dir, "TICKETS.md"), ticketsMd + "\n")

  // Pull textual workspace documents (specs, briefs) into .rebuild/docs/.
  const docs = ctx.documents || []
  let written = 0
  for (const d of docs) {
    if (!TEXTUAL.test(d.mimeType || "")) continue
    try {
      const full = await api(`/api/cli/document/${d.id}`, {}, token)
      const dec = decodeDataUrl(full.dataUrl)
      if (!dec) continue
      const safe = d.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || d.id
      fs.writeFileSync(path.join(docsDir, safe), dec.buf)
      written++
    } catch {
      /* skip docs we can't fetch */
    }
  }
  return { docsWritten: written, docsSkipped: docs.length - written, agentName: agentNames.join(", "), agentFiles }
}

function requireCfg() {
  const cfg = loadCfg()
  if (!cfg?.token) {
    console.error(c.red("Not logged in. Run: rebuild216 login"))
    process.exit(1)
  }
  return cfg
}

// Lazily import the Claude Agent SDK (uses your `claude login` session).
async function loadQuery() {
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk")
    return query
  } catch {
    console.error(c.red("Missing @anthropic-ai/claude-agent-sdk. Run `npm i` in the CLI dir."))
    process.exit(1)
  }
}

// Agent SDK options shared by the autonomous run and the chat (push blocked,
// rebuild MCP wired). `resume` continues an existing session for multi-turn chat.
// Anthropic API key for the agent engine (env or stored via `rebuild216 key`).
// When present, Claude Code authenticates with this key instead of a personal
// `claude login` subscription.
function anthropicKey(cfg) {
  return process.env.ANTHROPIC_API_KEY || cfg?.anthropicKey || ""
}

// One-line summary of how Claude Code will authenticate for this run.
function authLine(cfg) {
  if (process.env.ANTHROPIC_API_KEY) return c.dim("Auth: API key (ANTHROPIC_API_KEY)")
  if (cfg?.anthropicKey) return c.dim("Auth: API key (rebuild216 key)")
  return c.dim("Auth: claude login (personal subscription)")
}

// Optional numeric guard-rail from env (preferred) or stored config. Returns 0
// (= off) unless a positive number is set, so it never caps a run by surprise.
function numOpt(cfg, envName, cfgKey) {
  const raw = process.env[envName] ?? (cfg ? cfg[cfgKey] : undefined)
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function agentOptions(workDir, cfg, project, resume) {
  const key = anthropicKey(cfg)
  // F4 — agent guard-rails (budget + step cap + early stop). OFF unless set, so
  // long multi-ticket runs aren't capped by surprise. maxBudgetUsd stops the run
  // at a $ ceiling (→ error_max_budget_usd); maxTurns caps conversation steps;
  // taskBudget makes the model aware of its remaining token budget so it paces
  // tool use and wraps up before the limit instead of being killed mid-thought.
  const maxTurns = numOpt(cfg, "REBUILD_MAX_TURNS", "maxTurns")
  const maxBudgetUsd = numOpt(cfg, "REBUILD_MAX_BUDGET_USD", "maxBudgetUsd")
  const taskBudgetTokens = numOpt(cfg, "REBUILD_TASK_BUDGET_TOKENS", "taskBudgetTokens")
  // One observability trace per agent run; MCP tool spans nest under it. Only
  // forwarded when LANGFUSE_* is set — otherwise the MCP server no-ops.
  const traceId = randomUUID()
  const lfEnv = process.env.LANGFUSE_PUBLIC_KEY
    ? {
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY || "",
        LANGFUSE_HOST: process.env.LANGFUSE_HOST || "",
        LANGFUSE_CAPTURE_IO: process.env.LANGFUSE_CAPTURE_IO || "",
        LANGFUSE_TRACE_ID: traceId,
      }
    : {}
  return {
    cwd: workDir,
    permissionMode: "bypassPermissions",
    ...(maxTurns ? { maxTurns } : {}),
    ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
    ...(taskBudgetTokens ? { taskBudget: { total: taskBudgetTokens } } : {}),
    // Claude model for the agent engine, set platform-wide by a SUPER_ADMIN
    // (server `cli_model`). Omitted → Claude Code's default.
    ...(cfg.cliModel ? { model: cfg.cliModel } : {}),
    // Pass the API key to the Claude Code subprocess (env REPLACES the child
    // env, so spread process.env to keep PATH/HOME). Omitted → falls back to
    // the machine's `claude login`.
    ...(key ? { env: { ...process.env, ANTHROPIC_API_KEY: key } } : {}),
    allowedTools: [
      "Read",
      "Edit",
      "Write",
      "Bash",
      "mcp__rebuild__list_tickets",
      "mcp__rebuild__create_ticket",
      "mcp__rebuild__update_ticket_status",
      "mcp__rebuild__add_comment",
      "mcp__rebuild__capture_screenshots",
      "mcp__rebuild__upload_screenshot",
    ],
    mcpServers: {
      rebuild: {
        command: process.execPath,
        args: [MCP],
        env: {
          REBUILD_URL: cfg.url || URL_BASE,
          REBUILD_TOKEN: cfg.token,
          REBUILD_REFRESH_TOKEN: cfg.refreshToken || "",
          REBUILD_PROJECT: project,
          ...lfEnv,
        },
      },
    },
    ...(resume ? { resume } : {}),
  }
}

// Stream an agent run to stdout; return the session id (for resuming the chat).
// Report a finished agent run's cost/tokens to the server so CLI usage shows in
// the AI governance dashboard (best-effort).
async function reportCliUsage(opts, result) {
  try {
    const mu = result.modelUsage || {}
    const models = Object.keys(mu)
    let input = 0
    let output = 0
    for (const m of models) {
      const u = mu[m] || {}
      input += (u.inputTokens || 0) + (u.cacheReadInputTokens || 0) + (u.cacheCreationInputTokens || 0)
      output += u.outputTokens || 0
    }
    const cost = result.total_cost_usd || 0
    if (!cost && !input && !output) return
    await apiAuth(
      "/api/cli/usage",
      {
        method: "POST",
        body: JSON.stringify({
          feature: opts.feature || "cli",
          model: models[0] || "claude-code",
          inputTokens: input,
          outputTokens: output,
          costUsd: cost,
          workspaceId: opts.workspaceId || undefined,
          projectId: opts.projectId || undefined,
        }),
      },
      opts.cfg
    )
  } catch {
    /* best-effort */
  }
}

// --- Session-limit auto-resume (claude.ai subscription) ---------------------
// On a personal `claude login`, the Agent SDK emits a `rate_limit_event` whose
// `rate_limit_info.status` becomes 'rejected' when the 5h/7d limit is hit (the
// Claude Code subprocess prints "You've hit your session limit · resets …").
// Rather than crash the run, we capture `resetsAt`, stay alive with a live
// countdown — Ctrl+Q (or q) aborts — then RESUME the same session and continue.
const RESUME_PROMPT =
  "You were interrupted by a usage limit, now reset. Continue exactly where you left off and keep going through the remaining work — do not restart from scratch."

// resetsAt can be epoch seconds or ms; normalise to ms (0 if absent).
function resetsAtMs(info) {
  const v = Number(info?.resetsAt ?? info?.overageResetsAt ?? 0)
  if (!v) return 0
  return v < 1e12 ? v * 1000 : v
}

// Fallback when no resetsAt: parse "resets 3:50pm" / "resets 15:50" from text to
// a future epoch-ms (rolls to tomorrow if that clock time already passed). 0 if none.
function parseResetClock(text) {
  const m = /resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(text || ""))
  if (!m) return 0
  let h = Number(m[1])
  const min = Number(m[2] || 0)
  const ap = (m[3] || "").toLowerCase()
  if (ap === "pm" && h < 12) h += 12
  if (ap === "am" && h === 12) h = 0
  const d = new Date()
  d.setHours(h, min, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d.getTime()
}

function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h) return `${h}h${String(m).padStart(2, "0")}`
  if (m) return `${m}m${String(ss).padStart(2, "0")}s`
  return `${ss}s`
}

// Block until `whenMs`, showing a countdown. Resolves true when the wait finishes,
// false if the user pressed Ctrl+Q / q. Ctrl+C still hard-exits.
function waitForReset(whenMs, label) {
  const stdin = process.stdin
  const at = new Date(whenMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  console.log(
    `\n${c.yellow("⏸ Session limit reached")}${label ? c.dim(` (${label})`) : ""} — resumes around ${c.bold(at)}. ` +
      c.dim("Staying alive — press Ctrl+Q to quit.")
  )
  const canRaw = stdin.isTTY && typeof stdin.setRawMode === "function"
  return new Promise((resolve) => {
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      clearInterval(timer)
      if (canRaw) {
        try {
          stdin.setRawMode(false)
        } catch {
          /* ignore */
        }
        stdin.pause()
        stdin.removeListener("data", onData)
      }
      process.stdout.write("\n")
      resolve(ok)
    }
    const onData = (ch) => {
      const s = ch.toString("utf8")
      if (ch[0] === 0x11 || s === "q" || s === "Q") finish(false) // Ctrl+Q or q
      else if (ch[0] === 0x03) process.exit(130) // Ctrl+C
    }
    if (canRaw) {
      try {
        stdin.setRawMode(true)
      } catch {
        /* ignore */
      }
      stdin.resume()
      stdin.on("data", onData)
    }
    const render = () => {
      const remain = whenMs - Date.now()
      if (remain <= 0) return finish(true)
      process.stdout.write(`\r${c.yellow("⏳")} resuming in ${c.bold(fmtDur(remain))} ${c.dim("· Ctrl+Q to quit")}   `)
    }
    const timer = setInterval(render, 1000)
    render()
  })
}

// Stream an agent run to stdout; return the session id (for resuming the chat).
// If `opts.resumeWith(sessionId)` is given and a session limit is hit, it waits
// out the reset and resumes the same session instead of letting the run die.
async function streamAgent(run, opts = {}) {
  let sessionId = null
  let current = run
  for (;;) {
    let blockedUntil = 0 // >0 once a 'rejected' rate-limit is seen this pass
    let blockedLabel = ""
    try {
      for await (const msg of current) {
        if (msg.session_id) sessionId = msg.session_id
        if (msg.type === "rate_limit_event") {
          const info = msg.rate_limit_info || {}
          if (info.status === "rejected") {
            // No resetsAt → default to a short 5-minute backoff.
            blockedUntil = resetsAtMs(info) || blockedUntil || Date.now() + 5 * 60_000
            blockedLabel = info.rateLimitType || ""
          } else if (info.status === "allowed") {
            blockedUntil = 0 // recovered within the same stream
          }
          continue
        }
        if (msg.type === "assistant") {
          for (const block of msg.message?.content ?? []) {
            if (block.type === "text") process.stdout.write(block.text)
            else if (block.type === "tool_use") process.stdout.write(c.dim(`\n· ${block.name}\n`))
          }
        } else if (msg.type === "result") {
          if (opts.cfg) await reportCliUsage(opts, msg)
          // F4 — a guard-rail (budget / step cap) stopped the run cleanly. Tell
          // the user how to lift it instead of looking like a silent halt.
          if (msg.subtype === "error_max_budget_usd" || msg.subtype === "error_max_turns") {
            const cost = typeof msg.total_cost_usd === "number" ? ` ($${msg.total_cost_usd.toFixed(2)})` : ""
            const why = msg.subtype === "error_max_budget_usd" ? "budget" : "step (turn) limit"
            console.log(
              c.yellow(`\n⛔ Agent stopped at its ${why}${cost}.`) +
                c.dim(" Raise REBUILD_MAX_BUDGET_USD / REBUILD_MAX_TURNS (or run /run again to continue).")
            )
          }
          // A hard usage limit can also surface as an error result whose text mentions it.
          if (msg.is_error && !blockedUntil) {
            const at = parseResetClock(msg.result || (msg.errors || []).join(" "))
            if (at) blockedUntil = at
          }
        }
      }
    } catch (err) {
      // The SDK may throw on a hard limit; recover only if we can find a reset time.
      const at = blockedUntil || parseResetClock(err?.message || String(err))
      if (!(at && opts.resumeWith)) throw err
      blockedUntil = at
    }

    if (blockedUntil && opts.resumeWith) {
      const ok = await waitForReset(blockedUntil, blockedLabel)
      if (!ok) return sessionId // user pressed Ctrl+Q → stop, keep the session id
      console.log(c.cyan("▶ Resuming…\n"))
      current = opts.resumeWith(sessionId)
      continue
    }
    return sessionId
  }
}

// Fetch context, clone the repo into a visible folder, cd into it, block push,
// and write the REBUILD context into .rebuild/. Returns { ctx, repo, workDir }.
async function setupProject(project, cfg) {
  let ctx
  try {
    ctx = await apiAuth(`/api/cli/context?project=${encodeURIComponent(project)}`, {}, cfg)
  } catch (e) {
    console.error(c.red(`✗ ${e.message}`))
    process.exit(1)
  }
  if (!ctx.workspace?.githubRepo) {
    console.error(c.red("This project's workspace has no GitHub repo set."))
    process.exit(1)
  }
  // CLI/agent model is a platform setting a SUPER_ADMIN controls (server-side).
  if (ctx.cliModel) {
    cfg.cliModel = ctx.cliModel
    console.log(c.dim(`Model: ${ctx.cliModel}`))
  }
  const repo = ctx.workspace.githubRepo
  const todo = ctx.tickets.filter((t) => t.status !== "DONE")
  console.log(c.bold(`\nProject: ${ctx.project.name}`) + c.dim(`  repo ${repo}`))
  console.log(c.dim(`Tickets: ${ctx.tickets.length} total · ${todo.length} to do`))

  const repoName = repo.split("/").pop()
  const workDir = path.join(safeCwd(), repoName)
  console.log(c.dim(`Cloning ${repo} → ${workDir} …`))
  try {
    cloneRepo(repo, workDir)
  } catch (e) {
    console.error(c.red(`✗ ${e.message}`))
    process.exit(1)
  }
  try {
    process.chdir(workDir)
  } catch {
    /* stay in cwd if chdir fails */
  }
  console.log(c.green(`✓ Cloned. Now in ${workDir}`))

  // Switch to the project's own branch (one branch per project in the
  // workspace repo). The server slugifies the project name into ctx.project.branch.
  const branch = ctx.project.branch || null
  if (branch) {
    try {
      checkoutProjectBranch(workDir, branch)
      console.log(c.green(`✓ On branch ${c.bold(branch)} (project "${ctx.project.name}")`))
    } catch (e) {
      console.error(c.yellow(`⚠ Could not switch to branch ${branch}: ${e.message}`))
    }
  }
  setPushBlock(workDir, true)

  const ext = await writeContext(workDir, ctx, cfg.token)
  console.log(
    c.dim(
      `Context written to .rebuild/ (soul, skills, architecture, workflow, tickets` +
        (ext.docsWritten ? `, ${ext.docsWritten} doc${ext.docsWritten > 1 ? "s" : ""}` : "") +
        `).`
    )
  )
  if (ext.agentName) {
    console.log(c.green(`✓ Agent "${ext.agentName}" injected — ${ext.agentFiles} file(s) in .rebuild/agent/`))
  }
  return { ctx, repo, workDir }
}

// The autonomous delivery prompt over the open tickets.
function deliveryTask(ctx) {
  const todo = ctx.tickets.filter((t) => t.status !== "DONE")
  return `${buildSystem(ctx)}

The full context is in .rebuild/ (SOUL.md, SKILLS.md, ARCHITECTURE.md, WORKFLOW.md, TICKETS.md, docs/, and agent/ — the selected agent's UI templates, languages, rules and knowledge). Read it first.

Project "${ctx.project.name}" (${ctx.project.shortCode}). Tickets to deliver:
${todo
  .map((t) => `- [${t.shortId}] (${t.type}/${t.priority}) ${t.title}: ${t.description || ""}`)
  .join("\n")}`
}

// Primer for chat mode (sent once, before the first user message).
function chatPreamble(ctx) {
  return `${buildSystem(ctx)}

You are now in an interactive chat with the user about project "${ctx.project.name}" (${ctx.project.shortCode}). The repo is cloned in the current working directory; full context is in .rebuild/. You can read and edit files, run commands, and use the rebuild MCP tools to read, create, and update tickets (create_ticket adds real tickets to the board). Commit locally per change; never push. Help the user: answer questions, plan, and implement what they ask. If the board is empty and they ask to fill in tasks, create a coherent backlog with create_ticket — propose real tickets, never random filler.`
}

// After the project is set up, choose how to work on it.
async function chooseMode() {
  console.log(c.bold("\nHow do you want to work on this project?"))
  console.log(`  ${c.cyan("1")}. Autonomous delivery — Claude works through the open tickets on its own`)
  console.log(`  ${c.cyan("2")}. Chat with Claude Code ${c.dim("(+ rebuild MCP)")} — discuss, plan, ask, then act`)
  const a = await prompt("Choose [1/2] (default 1): ")
  return a.trim() === "2" ? "chat" : "run"
}

// rebuild216 <project> — set up, then pick a mode (autonomous vs chat).
async function cmdRun(project, forceMode) {
  const cfg = requireCfg()
  await ensurePersistentToken(cfg) // long delivery runs must not expire mid-flight
  console.log(authLine(cfg))
  const { ctx, repo, workDir } = await setupProject(project, cfg)
  const query = await loadQuery()

  const mode = forceMode || (await chooseMode())

  if (mode === "chat") {
    console.log(c.cyan(`\n💬 Chat with Claude Code about ${ctx.project.name}. Type a message, or /help.\n`))
    await session({ workDir, repo, ctx, cfg, project, query, sessionId: null, primed: false })
    return
  }

  let sessionId = null
  const todo = ctx.tickets.filter((t) => t.status !== "DONE")
  if (todo.length === 0) {
    console.log(c.green("\nAll tickets are DONE — starting a chat instead.\n"))
  } else {
    console.log(c.cyan("\n▶ Launching Claude Code (autonomous)…\n"))
    sessionId = await streamAgent(
      query({ prompt: deliveryTask(ctx), options: agentOptions(workDir, cfg, project) }),
      {
        cfg,
        feature: "cli-delivery",
        projectId: ctx.project?.id,
        workspaceId: ctx.workspace?.id,
        resumeWith: (rsid) =>
          query({ prompt: RESUME_PROMPT, options: agentOptions(workDir, cfg, project, rsid) }),
      }
    )
    console.log(c.green("\n\n✓ Agent finished the autonomous pass."))
  }
  await session({ workDir, repo, ctx, cfg, project, query, sessionId, primed: sessionId != null })
}

function sessionHelp() {
  console.log(
    "Type a message to chat with Claude Code (the rebuild MCP tools are available).\n" +
      "Commands: " +
      [c.cyan("/run"), c.cyan("/push"), c.cyan("/status"), c.cyan("/log"), c.cyan("/help"), c.cyan("/quit")].join(", ") +
      c.dim("\n  /run = autonomous pass over open tickets · commits are local until /push")
  )
}

// Unified interactive session: free text = chat with Claude Code (multi-turn,
// MCP-enabled); slash commands = git/push/run controls.
async function session({ workDir, repo, ctx, cfg, project, query, sessionId, primed }) {
  let sid = sessionId
  let isPrimed = primed
  console.log(c.bold("\nReady.") + c.dim(" Commits stay local until you /push."))
  sessionHelp()
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " })
  rl.prompt()
  for await (const line of rl) {
    const cmd = line.trim()
    if (!cmd) {
      rl.prompt()
      continue
    }
    if (cmd === "/quit" || cmd === "/exit") {
      console.log(c.dim(`\nThe clone is at ${workDir}`))
      console.log("To go there in your shell: " + c.cyan(`cd ${workDir}`))
      break
    } else if (cmd === "/help") {
      sessionHelp()
    } else if (cmd === "/status") {
      process.stdout.write(git(["status", "--short"], workDir).stdout || "(clean)\n")
    } else if (cmd === "/log") {
      process.stdout.write(git(["log", "--oneline", "-15"], workDir).stdout)
    } else if (cmd === "/push") {
      setPushBlock(workDir, false) // lift the block
      const branch = (git(["rev-parse", "--abbrev-ref", "HEAD"], workDir).stdout || "main").trim()
      console.log(c.dim(`Pushing ${branch} → origin (${repo})…`))
      const r = spawnSync("git", ["push", "-u", "origin", branch], { cwd: workDir, stdio: "inherit" })
      if (r.status === 0) console.log(c.green("✓ Pushed."))
      else {
        console.log(c.red("✗ Push failed."))
        setPushBlock(workDir, true)
      }
    } else if (cmd === "/run") {
      // Re-fetch tickets so the autonomous pass sees current statuses.
      try {
        ctx = await apiAuth(`/api/cli/context?project=${encodeURIComponent(project)}`, {}, cfg)
      } catch {
        /* keep the previous context if the refetch fails */
      }
      const todo = ctx.tickets.filter((t) => t.status !== "DONE")
      if (todo.length === 0) {
        console.log(c.green("All tickets are DONE — nothing to run."))
      } else {
        console.log(c.cyan(`\n▶ Autonomous pass over ${todo.length} open ticket(s)…\n`))
        sid = (await streamAgent(query({ prompt: deliveryTask(ctx), options: agentOptions(workDir, cfg, project, sid) }), { cfg, feature: "cli-delivery", projectId: ctx.project?.id, workspaceId: ctx.workspace?.id, resumeWith: (rsid) => query({ prompt: RESUME_PROMPT, options: agentOptions(workDir, cfg, project, rsid) }) })) || sid
        isPrimed = true
        console.log(c.green("\n\n✓ Pass finished."))
      }
    } else if (cmd.startsWith("/")) {
      console.log(c.dim("Unknown command. /run, /push, /status, /log, /help, /quit"))
    } else {
      // Chat turn → Claude Code, resuming the session for continuity.
      const prompt = isPrimed ? cmd : `${chatPreamble(ctx)}\n\nUser: ${cmd}`
      isPrimed = true
      process.stdout.write(c.cyan("\nclaude> "))
      sid = (await streamAgent(query({ prompt, options: agentOptions(workDir, cfg, project, sid) }), { cfg, feature: "cli-chat", projectId: ctx.project?.id, workspaceId: ctx.workspace?.id, resumeWith: (rsid) => query({ prompt: RESUME_PROMPT, options: agentOptions(workDir, cfg, project, rsid) }) })) || sid
      process.stdout.write("\n")
    }
    rl.prompt()
  }
  rl.close()
}

// Interactive project picker (no arg) → GET /api/cli/projects → numbered choice.
async function pickProject() {
  const cfg = loadCfg()
  if (!cfg?.token) {
    console.error(c.red("Not logged in. Run: rebuild216 login"))
    process.exit(1)
  }
  let data
  try {
    data = await apiAuth("/api/cli/projects", {}, cfg)
  } catch (e) {
    console.error(c.red(`✗ ${e.message}`))
    process.exit(1)
  }
  const projects = data.projects || []
  if (projects.length === 0) {
    console.error(c.red("No projects you can access."))
    process.exit(1)
  }
  console.log(c.bold("\nYour projects:"))
  projects.forEach((p, i) => {
    console.log(
      `  ${c.cyan(String(i + 1).padStart(2))}. ${p.name} ${c.dim(`(${p.shortCode}) · ${p.workspace} · ${p.status}`)}`
    )
  })
  const ans = await prompt("\nPick a project [number]: ")
  const idx = parseInt(ans, 10) - 1
  if (!(idx >= 0 && idx < projects.length)) {
    console.error(c.red("Invalid selection."))
    process.exit(1)
  }
  return projects[idx].name
}

// Run one verification step, streaming output live AND capturing it (so we can
// tell a genuine failure from a tool that simply isn't installed). On Windows,
// npm is a .cmd → use a shell.
function runStep(label, cmd, args, workDir) {
  return new Promise((resolve) => {
    console.log(c.cyan(`\n▶ ${label}: ${cmd} ${args.join(" ")}`))
    let out = ""
    const child = spawn(cmd, args, { cwd: workDir, shell: process.platform === "win32" })
    const onChunk = (d) => {
      const s = d.toString()
      out += s
      process.stdout.write(s)
    }
    child.stdout.on("data", onChunk)
    child.stderr.on("data", onChunk)
    child.on("error", (e) => resolve({ ok: false, out: out + String(e.message), code: e.code }))
    child.on("close", (code) => resolve({ ok: code === 0, out, code }))
  })
}

// A step failed because its tool isn't installed in the repo (not a real
// lint/test/type failure) — exit 127, or the shell's "not found" message.
function isMissingTool(res) {
  return res.code === 127 || /command not found|not recognized|is not recognized|ENOENT/i.test(res.out)
}

// tsc failed but EVERY "error TSxxxx" is in node_modules/* — i.e. broken library
// typings that pre-exist on main and aren't caused by the merge. Such errors
// must not block an integration. Returns false if any error is in project code
// (or if we can't find structured errors → treat as a real failure).
function onlyDependencyTypeErrors(out) {
  const errs = out.split(/\r?\n/).filter((l) => /\): error TS\d+/.test(l))
  if (errs.length === 0) return false
  return errs.every((l) => /(^|[\s(])node_modules[\\/]/.test(l) || l.includes("/node_modules/"))
}

// eslint/prettier reported problems it can fix automatically.
function isAutoFixable(out) {
  return /--fix option|potentially fixable|run `[^`]*--fix/i.test(out)
}

// Ask Claude to fix a failing verification step (lint/typecheck/test/build) at
// the root cause — run the fixer for formatting, edit code for real errors.
async function fixStepWithClaude(workDir, step, cfg, query) {
  console.log(c.yellow(`  ⟳ Asking Claude to fix the failing "${step}"…`))
  const prompt =
    `In this repository (the current working directory), \`npm run ${step}\` is failing. ` +
    `Run it yourself to see the errors, then fix the ROOT CAUSE so it passes:\n` +
    `- For formatting/style/lint problems, run the project's own fixer (e.g. \`npx eslint . --fix\` or \`npx prettier --write .\`).\n` +
    `- For genuine type/test/build errors, edit the code to fix them.\n` +
    `- Do NOT disable lint rules, delete tests, or weaken configs just to silence the failure.\n` +
    `When \`npm run ${step}\` exits cleanly, stop. Do not commit or push — that is handled for you.`
  try {
    await streamAgent(query({ prompt, options: agentOptions(workDir, cfg, "") }), { cfg, feature: "cli-ops-fix" })
  } catch (e) {
    console.error(c.red(`    Claude run failed: ${e.message}`))
  }
  process.stdout.write("\n")
}

// Install deps + run whatever of typecheck/lint/test/build exist. Self-heals:
// auto-runs the fixer for fixable lint, then hands any residual failure to
// Claude. Returns the still-failing step name, or null if everything passed. A
// step whose tool isn't installed is skipped (it can't block an integration).
async function buildAndTest(workDir, cfg) {
  const pkgPath = path.join(workDir, "package.json")
  if (!fs.existsSync(pkgPath)) {
    console.log(c.yellow("⚠ No package.json — skipping build/test (nothing to verify)."))
    return null
  }
  let scripts = {}
  try {
    scripts = JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts || {}
  } catch {
    /* malformed package.json → treat as no scripts */
  }
  const hasLock = fs.existsSync(path.join(workDir, "package-lock.json"))
  let install = await runStep("install", "npm", [hasLock ? "ci" : "install"], workDir)
  // Merging branches often leaves package-lock.json out of sync with
  // package.json, which `npm ci` refuses. Repair it with `npm install` (the
  // updated lockfile gets committed with the integration).
  if (!install.ok && hasLock && /can only install|in sync|Missing:.*from lock file|EUSAGE|npm ci/i.test(install.out)) {
    console.log(c.yellow("  ⟳ Lockfile out of sync (merge artifact) — repairing with npm install…"))
    install = await runStep("install (repair lockfile)", "npm", ["install"], workDir)
  }
  if (!install.ok) return "install"

  let query = null // lazily loaded only if Claude is needed
  for (const step of ["typecheck", "lint", "test", "build"]) {
    if (!scripts[step]) continue
    const args = step === "test" ? ["test"] : ["run", step]
    let res = await runStep(step, "npm", args, workDir)
    if (res.ok) continue
    if (isMissingTool(res)) {
      console.log(c.yellow(`⚠ "${step}" skipped — its tool isn't installed in this repo (${scripts[step]}).`))
      continue
    }
    if (step === "typecheck" && onlyDependencyTypeErrors(res.out)) {
      console.log(c.yellow(`⚠ "typecheck" — only pre-existing node_modules/* type errors (not from your code); continuing.`))
      continue
    }
    // Auto-fix pass for fixable lint/format problems, then re-run.
    if (isAutoFixable(res.out)) {
      console.log(c.yellow(`  ⟳ "${step}" has auto-fixable problems — running the fixer…`))
      await runStep(`${step} --fix`, "npm", [...args, "--", "--fix"], workDir)
      res = await runStep(step, "npm", args, workDir)
      if (res.ok) {
        console.log(c.green(`  ✓ "${step}" auto-fixed`))
        continue
      }
    }
    // Residual failure → let Claude fix the root cause, then re-run once.
    if (!query) query = await loadQuery()
    await fixStepWithClaude(workDir, step, cfg, query)
    res = await runStep(step, "npm", args, workDir)
    if (res.ok) {
      console.log(c.green(`  ✓ "${step}" fixed (via Claude)`))
      continue
    }
    return step
  }
  return null
}

// A merge of `branch` into the target hit conflicts. Instead of skipping, hand
// the in-progress merge to Claude Code to resolve, then verify it's clean and
// committed. Returns true if the conflict was resolved & committed.
async function resolveConflictWithClaude(workDir, branch, target, cfg, query) {
  const conflicted = (git(["diff", "--name-only", "--diff-filter=U"], workDir).stdout || "").trim()
  console.log(c.yellow(`  ⟳ Conflict merging ${branch} — asking Claude to resolve…`))
  if (conflicted) console.log(c.dim(`    conflicted files:\n      ${conflicted.split("\n").join("\n      ")}`))

  const prompt =
    `You are integrating the branch "${branch}" into "${target}" in this git repository (the current working directory).\n` +
    `A \`git merge\` is IN PROGRESS and produced conflicts. Conflicted files:\n${conflicted || "(see git status)"}\n\n` +
    `Your job:\n` +
    `1. Resolve EVERY conflict by editing the files to a correct combination of BOTH sides — keep both features working. ` +
    `Do not simply delete one side unless it is clearly obsolete. Remove all conflict markers (<<<<<<<, =======, >>>>>>>).\n` +
    `2. Do NOT run \`git merge --abort\` or \`git reset\` — that would throw away the work.\n` +
    `3. When every conflict is resolved, run \`git add -A\` then commit the merge: \`git commit --no-edit\`.\n` +
    `4. If the project has a typecheck or test script, run it and fix what the merge broke so it stays coherent.\n` +
    `Then stop. Use Bash for git commands and Read/Edit/Write for files.`

  try {
    await streamAgent(query({ prompt, options: agentOptions(workDir, cfg, "") }), { cfg, feature: "cli-ops-conflict" })
  } catch (e) {
    console.error(c.red(`    Claude run failed: ${e.message}`))
  }
  process.stdout.write("\n")

  // Verify: no unmerged paths remain.
  const stillUnmerged = (git(["ls-files", "-u"], workDir).stdout || "").trim()
  if (stillUnmerged) return false
  // If resolved but not committed, finish the merge commit ourselves.
  if (fs.existsSync(path.join(workDir, ".git", "MERGE_HEAD"))) {
    git(["add", "-A"], workDir)
    const ci = git(["commit", "--no-edit"], workDir)
    if (ci.status !== 0) return false
  }
  return true
}

// rebuild216 -ops — pick an org repo, merge every branch into its main branch,
// build + test the integration, and (on green + confirmation) push main.
async function cmdOps() {
  const cfg = loadCfg()
  if (!cfg?.token) {
    console.error(c.red("Not logged in. Run: rebuild216 login"))
    process.exit(1)
  }
  console.log(authLine(cfg))
  let data
  try {
    data = await apiAuth("/api/cli/repos", {}, cfg)
  } catch (e) {
    console.error(c.red(`✗ ${e.message}`))
    process.exit(1)
  }
  const repos = data.repos || []
  if (repos.length === 0) {
    console.error(c.red("No repositories found in the organization."))
    process.exit(1)
  }
  console.log(c.bold(`\nRepositories in ${data.org}:`))
  repos.forEach((r, i) => {
    const age = r.pushedAt ? new Date(r.pushedAt).toLocaleDateString() : "—"
    console.log(
      `  ${c.cyan(String(i + 1).padStart(2))}. ${r.name} ${c.dim(`(${r.private ? "private" : "public"} · default ${r.defaultBranch} · pushed ${age})`)}`
    )
  })
  const ans = await prompt("\nPick a repo [number]: ")
  const idx = parseInt(ans, 10) - 1
  if (!(idx >= 0 && idx < repos.length)) {
    console.error(c.red("Invalid selection."))
    process.exit(1)
  }
  const repo = repos[idx]

  if (!process.env.GITHUB_TOKEN) {
    console.log(c.yellow("⚠ GITHUB_TOKEN is not set — cloning/pushing a private repo will fail. Set it and retry if needed."))
  }

  // Clone (full history; all remote branches available as origin/*).
  const base = safeCwd()
  const workDir = path.join(base, `${repo.name}-ops`)
  console.log(c.dim(`\nCloning ${repo.fullName} → ${workDir} …`))
  try {
    // Don't stand inside the dir we're about to delete (that's what leaves a
    // stale cwd inode and breaks the next run with EPERM uv_cwd).
    try {
      process.chdir(base)
    } catch {
      /* best effort */
    }
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true })
    cloneRepo(repo.fullName, workDir)
  } catch (e) {
    console.error(c.red(`✗ ${e.message}`))
    process.exit(1)
  }

  // Target = the repo's main/default branch.
  const all = remoteBranches(workDir)
  const target = all.includes("main") ? "main" : repo.defaultBranch
  git(["fetch", "--all", "--prune"], workDir)

  // Which branches to integrate? By default only project branches whose project
  // is REVIEW/DONE (REBUILD_OPS_ALL=1 to include everything).
  let toMerge = all.filter((b) => b !== target)
  if (!process.env.REBUILD_OPS_ALL) {
    try {
      const info = await apiAuth(`/api/cli/integration?repo=${encodeURIComponent(repo.fullName)}`, {}, cfg)
      if (info.matched && Array.isArray(info.readyBranches)) {
        const ready = new Set(info.readyBranches)
        const skipped = toMerge.filter((b) => !ready.has(b))
        if (skipped.length)
          console.log(c.yellow(`⚠ Skipping ${skipped.length} branch(es) whose project isn't REVIEW/DONE: ${skipped.join(", ")}  (REBUILD_OPS_ALL=1 to include)`))
        toMerge = toMerge.filter((b) => ready.has(b))
      }
    } catch (e) {
      console.log(c.dim(`(readiness check unavailable: ${e.message} — integrating all branches)`))
    }
  }
  if (toMerge.length === 0) {
    console.log(c.yellow("Nothing ready to integrate — set a project to Review/Done, or run with REBUILD_OPS_ALL=1."))
    return
  }

  // Build the integration on a dedicated branch — never push to main directly.
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16)
  const intBranch = `ops/integration-${stamp}`
  if (git(["checkout", "-B", intBranch, `origin/${target}`], workDir).status !== 0) {
    console.error(c.red(`✗ Could not create the integration branch from origin/${target}.`))
    process.exit(1)
  }
  console.log(c.bold(`\nIntegrating into ${c.cyan(intBranch)} (← ${target}): `) + toMerge.map((b) => c.dim(b)).join(", "))

  const merged = []
  const conflicted = []
  let query = null // lazily loaded only if a conflict needs Claude
  for (const b of toMerge) {
    const r = git(["merge", "--no-edit", `origin/${b}`], workDir)
    if (r.status === 0) {
      console.log(c.green(`  ✓ merged ${b}`))
      merged.push(b)
      continue
    }
    if (!query) query = await loadQuery()
    const ok = await resolveConflictWithClaude(workDir, b, intBranch, cfg, query)
    if (ok) {
      console.log(c.green(`  ✓ resolved & merged ${b} (via Claude)`))
      merged.push(b)
    } else {
      git(["merge", "--abort"], workDir)
      console.log(c.red(`  ✗ ${b} — unresolved conflict; skipped`))
      conflicted.push(b)
    }
  }
  if (conflicted.length)
    console.log(c.yellow(`\n⚠ Skipped (unresolved conflicts): ${conflicted.join(", ")}`))
  if (merged.length === 0) {
    console.log(c.yellow("No branches merged cleanly — nothing to open a PR for."))
    return
  }

  // Verify the integration (self-heals fixable lint + delegates the rest to Claude).
  const failed = await buildAndTest(workDir, cfg)
  if (failed) {
    console.error(c.red(`\n✗ Verification failed at "${failed}". Not opening a PR.`))
    console.error(c.dim(`  The integration tree is in ${workDir} for you to inspect.`))
    process.exit(1)
  }
  console.log(c.green(`\n✓ Build + tests passed on ${intBranch}.`))
  if ((git(["status", "--porcelain"], workDir).stdout || "").trim()) {
    git(["add", "-A"], workDir)
    git(
      ["-c", "user.name=rebuild216", "-c", "user.email=rebuild216@users.noreply.github.com",
       "commit", "-m", "style: automated lint/verification fixes (rebuild216 ops)"],
      workDir
    )
    console.log(c.green("✓ Committed automated fixes."))
  }

  // Confirm → push the integration branch → open a PR → AI review. Main itself
  // is never pushed; it's merged via the PR once CI is green and review passes.
  const confirm = await prompt(
    c.bold(`\nPush ${intBranch} and open a PR into ${target} (${merged.length} project branch(es))? [y/N]: `)
  )
  if (!/^y(es)?$/i.test(confirm.trim())) {
    console.log(c.dim("Aborted — nothing pushed."))
    return
  }
  const push = spawnSync("git", ["push", "-u", "origin", intBranch], { cwd: workDir, stdio: "inherit" })
  if (push.status !== 0) {
    console.error(c.red(`✗ Push failed. Check your GITHUB_TOKEN permissions for ${repo.fullName}.`))
    process.exit(1)
  }

  const prBody =
    `Automated integration by **rebuild216 -ops**.\n\n` +
    `**Merged (${merged.length}):** ${merged.join(", ")}\n` +
    (conflicted.length ? `**Skipped (conflicts):** ${conflicted.join(", ")}\n` : "") +
    `\nBuild + tests passed locally. Merge after CI is green and the AI review is addressed.`
  let pr
  try {
    pr = await apiAuth(
      "/api/cli/integration",
      { method: "POST", body: JSON.stringify({ action: "pr", repo: repo.fullName, head: intBranch, base: target, title: `Integration ${stamp} (${merged.length} project${merged.length > 1 ? "s" : ""})`, body: prBody }) },
      cfg
    )
  } catch (e) {
    console.error(c.red(`✗ Branch pushed, but opening the PR failed: ${e.message}`))
    process.exit(1)
  }
  console.log(c.green(`\n✓ PR #${pr.number} opened → ${pr.url}`))

  try {
    const rev = await apiAuth(
      "/api/cli/integration",
      { method: "POST", body: JSON.stringify({ action: "review", repo: repo.fullName, number: pr.number, head: intBranch, base: target, title: `Integration PR #${pr.number}` }) },
      cfg
    )
    if (rev.score)
      console.log(c.cyan(`🤖 AI review posted — grade ${rev.score}, ${rev.findings} finding(s)${rev.critical ? `, ${rev.critical} critical` : ""}.`))
  } catch (e) {
    console.log(c.dim(`(AI review skipped: ${e.message})`))
  }

  console.log(c.bold(`\n✓ Integration ready. Review PR #${pr.number}, then merge ${intBranch} → ${target} once CI is green.`))
}

// Export the curated AI dataset (feedback ⋈ traced prompt/response) as JSONL.
// Filters: --feature <name> --workspace <id> --since <ISO> --min-score <-1|0|1>
// Output: stdout, or --out <file>. Requires login + ai.traces.read (admin).
async function cmdExportDataset(argv) {
  const cfg = loadCfg()
  if (!cfg?.token) {
    console.error("Not logged in. Run: rebuild216 login")
    process.exit(1)
  }
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const params = new URLSearchParams()
  for (const [k, q] of [
    ["--feature", "feature"],
    ["--workspace", "workspace"],
    ["--since", "since"],
    ["--min-score", "minScore"],
  ]) {
    const v = flag(k)
    if (v != null) params.set(q, v)
  }
  const base = cfg.url || URL_BASE
  const res = await fetch(`${base}/api/cli/dataset?${params.toString()}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  })
  if (!res.ok) {
    console.error(`Export failed: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  const jsonl = await res.text()
  const out = flag("--out")
  if (out) {
    fs.writeFileSync(out, jsonl)
    console.error(`✓ Wrote ${jsonl.split("\n").filter(Boolean).length} rows → ${out}`)
  } else {
    process.stdout.write(jsonl)
  }
}

const [, , arg, arg2] = process.argv
if (arg === "-ops" || arg === "--ops" || arg === "ops") {
  await cmdOps()
} else if (arg === "ai:export-dataset") {
  await cmdExportDataset(process.argv.slice(3))
} else if (arg === "--help" || arg === "-h") {
  console.log(
    "Usage:\n" +
      "  rebuild216 login\n" +
      "  rebuild216                 (pick a project, then choose: autonomous or chat)\n" +
      "  rebuild216 <project>       (named project, then choose the mode)\n" +
      "  rebuild216 chat [project]  (skip the menu — go straight to chat + MCP)\n" +
      "  rebuild216 -ops            (pick an org repo, integrate ready branches → PR + AI review)\n" +
      "  rebuild216 key <sk-...>    (use a central Anthropic API key instead of `claude login`; --clear to remove)\n" +
      "  rebuild216 ai:export-dataset [--feature x] [--workspace id] [--since ISO] [--min-score 1] [--out file]\n" +
      "                             (export the curated AI feedback dataset as JSONL — admin only)"
  )
} else if (arg === "key") {
  const cfg = loadCfg() || {}
  if (arg2 === "--clear") {
    delete cfg.anthropicKey
    saveCfg(cfg)
    console.log("Anthropic API key cleared — the agent will use `claude login` again.")
  } else if (arg2) {
    cfg.anthropicKey = arg2
    saveCfg(cfg)
    console.log("✓ Anthropic API key saved. The agent will authenticate with it (no `claude login` needed).")
  } else {
    console.log(
      "Usage: rebuild216 key <sk-ant-...>   (or --clear)\n" +
        "Or set ANTHROPIC_API_KEY in your environment. When set, rebuild216 runs Claude Code on this key,\n" +
        "not your personal `claude login` subscription."
    )
  }
} else if (arg === "login") {
  await cmdLogin()
} else if (arg === "logout") {
  try {
    fs.unlinkSync(CFG)
  } catch {
    /* none */
  }
  console.log("Logged out.")
} else if (arg === "chat") {
  const project = arg2 || (await pickProject())
  await cmdRun(project, "chat")
} else {
  const project = arg || (await pickProject())
  await cmdRun(project)
}
