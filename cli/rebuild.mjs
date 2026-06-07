#!/usr/bin/env node
// REBUILD CLI — drives the platform API from the terminal.
// Usage: node cli/rebuild.mjs <command> [args]
//   Set REBUILD_URL to point at a running server (default http://localhost:3000).

const BASE = process.env.REBUILD_URL ?? "http://localhost:3000"

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} — ${typeof body === "object" ? JSON.stringify(body) : body}`
    )
  }
  return body
}

function usage() {
  console.log(`${c.bold("REBUILD CLI")}  ${c.dim(`(${BASE})`)}

${c.bold("Usage:")} node cli/rebuild.mjs <command> [args]

${c.bold("Commands:")}
  ${c.cyan("health")}                         Service health check
  ${c.cyan("whoami")}                          Show the current user
  ${c.cyan("login")} <userId|email>            Switch the active session
  ${c.cyan("workspaces")}                      List your workspaces
  ${c.cyan("projects")} <workspaceId>          List projects in a workspace
  ${c.cyan("tickets")} <projectId> [status]    List tickets (optionally by status)
  ${c.cyan("ticket:new")} <projectId> <title> [type] [priority]
  ${c.cyan("review")} <workspaceId> <prNumber> Run an AI code review
  ${c.cyan("summary")} <projectId>             AI project summary
`)
}

function table(rows, cols) {
  if (rows.length === 0) return console.log(c.dim("(none)"))
  const widths = cols.map((col) =>
    Math.max(col.header.length, ...rows.map((r) => String(col.get(r) ?? "").length))
  )
  const line = (cells) =>
    cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join("  ")
  console.log(c.bold(line(cols.map((c2) => c2.header))))
  for (const r of rows) console.log(line(cols.map((col) => col.get(r))))
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  try {
    switch (cmd) {
      case "health": {
        const h = await api("/api/health")
        console.log(c.green(`status: ${h.status}`))
        console.log(c.dim(JSON.stringify(h.counts)))
        break
      }
      case "whoami": {
        const me = await api("/api/auth/me")
        console.log(`${c.bold(me.user.name)} ${c.dim(`<${me.user.email}>`)} — ${me.user.role}`)
        console.log(c.dim(`${me.workspaces.length} workspace(s)`))
        break
      }
      case "login": {
        if (!args[0]) throw new Error("provide a userId or email")
        const key = args[0].includes("@") ? { email: args[0] } : { userId: args[0] }
        const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify(key) })
        console.log(c.green(`Signed in as ${r.user.name} (${r.user.role})`))
        break
      }
      case "workspaces": {
        const ws = await api("/api/workspaces")
        table(ws, [
          { header: "ID", get: (w) => w.id },
          { header: "NAME", get: (w) => w.name },
          { header: "REPO", get: (w) => w.githubRepo },
          { header: "STATUS", get: (w) => w.status },
        ])
        break
      }
      case "projects": {
        if (!args[0]) throw new Error("provide a workspaceId")
        const ps = await api(`/api/workspaces/${args[0]}/projects`)
        table(ps, [
          { header: "ID", get: (p) => p.id },
          { header: "CODE", get: (p) => p.shortCode },
          { header: "NAME", get: (p) => p.name },
          { header: "STATUS", get: (p) => p.status },
        ])
        break
      }
      case "tickets": {
        if (!args[0]) throw new Error("provide a projectId")
        const q = args[1] ? `?status=${args[1]}` : ""
        const ts = await api(`/api/projects/${args[0]}/tickets${q}`)
        table(ts, [
          { header: "ID", get: (t) => t.shortId },
          { header: "TYPE", get: (t) => t.type },
          { header: "PRIO", get: (t) => t.priority },
          { header: "STATUS", get: (t) => t.status },
          { header: "TITLE", get: (t) => t.title },
        ])
        break
      }
      case "ticket:new": {
        const [projectId, title, type, priority] = args
        if (!projectId || !title) throw new Error("usage: ticket:new <projectId> <title> [type] [priority]")
        const t = await api(`/api/projects/${projectId}/tickets`, {
          method: "POST",
          body: JSON.stringify({
            title,
            type: type ?? "TASK",
            priority: priority ?? "MEDIUM",
            status: "TODO",
          }),
        })
        console.log(c.green(`Created ${t.shortId}`))
        break
      }
      case "review": {
        const [wsId, prNumber] = args
        if (!wsId || !prNumber) throw new Error("usage: review <workspaceId> <prNumber>")
        const { review } = await api("/api/ai/review", {
          method: "POST",
          body: JSON.stringify({ wsId, prNumber: Number(prNumber) }),
        })
        console.log(`${c.bold(`Score ${review.score}`)} ${c.dim(`(${review.generatedBy})`)}`)
        console.log(review.summary)
        for (const f of review.findings)
          console.log(`  ${c.cyan(f.severity)} ${f.title} — ${f.detail}`)
        break
      }
      case "summary": {
        if (!args[0]) throw new Error("provide a projectId")
        const { summary } = await api("/api/ai/summary", {
          method: "POST",
          body: JSON.stringify({ kind: "project", projectId: args[0] }),
        })
        console.log(summary)
        break
      }
      case undefined:
      case "help":
      case "-h":
      case "--help":
        usage()
        break
      default:
        console.error(c.red(`Unknown command: ${cmd}`))
        usage()
        process.exit(1)
    }
  } catch (err) {
    console.error(c.red(`Error: ${err.message}`))
    console.error(c.dim(`Is the server running at ${BASE}? Set REBUILD_URL to override.`))
    process.exit(1)
  }
}

main()
