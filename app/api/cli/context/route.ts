import { SEL, sb } from "@/lib/data"
import { userFromBearer } from "@/lib/cli-auth"
import { isWorkspaceMember } from "@/lib/auth/guard"
import { isAdmin } from "@/lib/auth"
import { defaultOrg } from "@/lib/github"
import { listRepoFiles, readRepoFile } from "@/lib/doc-loader"
import type { Project, Ticket, Workspace } from "@/lib/types"

export const dynamic = "force-dynamic"

// Versioned shared docs shipped to the CLI: rebuild216 doctrine (cli/agent/*),
// modular skills (cli/agent/skills/**) and the shared contracts. The CLI writes
// these into .rebuild/ (additive — never overwrites the live context files).
function agentBundle(): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = []
  const add = (target: string, content: string | null) => {
    if (content) out.push({ path: target, content })
  }
  for (const f of ["SOUL.md", "WORKFLOW.md", "ARCHITECTURE.md", "TICKETS.md"])
    add(`doctrine/${f}`, readRepoFile(`cli/agent/${f}`))
  for (const rel of listRepoFiles("cli/agent/skills"))
    add(`skills/${rel}`, readRepoFile(`cli/agent/skills/${rel}`))
  for (const rel of listRepoFiles("agent_contracts"))
    add(`agent_contracts/${rel}`, readRepoFile(`agent_contracts/${rel}`))
  return out
}

// Normalize a stored repo to "owner/repo": prepend the default org when a bare
// name was saved (e.g. "aziztest" → "Rebuild-main-org/aziztest").
function normalizeRepo(repo?: string | null): string {
  const r = (repo ?? "").trim()
  if (!r) return ""
  return r.includes("/") ? r : `${defaultOrg()}/${r}`
}

// One repo per workspace, one branch per project: derive a safe git branch name
// from the project name (e.g. "Auth, RLS & Multi-tenancy" → "auth-rls-multi-tenancy").
function branchForProject(name: string, shortCode?: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return slug || (shortCode ?? "").toLowerCase() || "project"
}

// GET /api/cli/context?project=<name|shortCode> — resolves a project (by name
// or short code) the caller can access, with its workspace, repo and tickets.
export async function GET(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const q = new URL(request.url).searchParams.get("project")?.trim()
  if (!q) return Response.json({ error: "project is required" }, { status: 400 })

  // Resolve in JS rather than via a PostgREST .or() filter: project names can
  // contain commas, parens, "&" etc. that break (or get injected into) the
  // filter expression. Fetch all projects and match by name or short code,
  // exact first then forgiving substring.
  const { data: projRows } = await sb().from("projects").select(SEL.project)
  const all = (projRows ?? []) as Project[]
  const norm = (s: string) => s.trim().toLowerCase()
  const ql = norm(q)
  let projects = all.filter((p) => norm(p.name) === ql || norm(p.shortCode) === ql)
  if (projects.length === 0)
    projects = all.filter((p) => norm(p.name).includes(ql) || norm(p.shortCode).includes(ql))
  if (projects.length === 0) return Response.json({ error: `No project "${q}"` }, { status: 404 })

  // Pick the first the user can access (ADMIN sees all).
  let chosen: Project | undefined
  for (const p of projects) {
    if (isAdmin(user.role) || (await isWorkspaceMember(user.id, p.workspaceId))) {
      chosen = p
      break
    }
  }
  if (!chosen) return Response.json({ error: "No access to that project" }, { status: 403 })

  // CLI heartbeat with the active project (drives the "CLI connected" status).
  try {
    await sb()
      .from("cli_sessions")
      .upsert(
        { user_id: user.id, last_seen_at: new Date().toISOString(), last_project: chosen.name },
        { onConflict: "user_id" }
      )
  } catch {
    /* best-effort */
  }

  const [{ data: wsRow }, { data: ticketRows }, { data: docRows }, { data: agentRows }] =
    await Promise.all([
      sb().from("workspaces").select(SEL.workspace).eq("id", chosen.workspaceId).maybeSingle(),
      sb().from("tickets").select(SEL.ticket).eq("project_id", chosen.id).order("order"),
      sb()
        .from("documents")
        .select("id,name,mimeType:mime_type")
        .eq("workspace_id", chosen.workspaceId)
        .order("created_at", { ascending: false }),
      sb().from("agent_docs").select("name,content"),
    ])
  const ws = wsRow as Workspace | null
  const tickets = (ticketRows ?? []) as Ticket[]
  const globals = Object.fromEntries((agentRows ?? []).map((d) => [d.name, d.content]))

  // Selected agents for this workspace → their file bundles (Super Admin library).
  const { data: links } = await sb()
    .from("workspace_agents")
    .select("agent_id")
    .eq("workspace_id", chosen.workspaceId)
  const agentIds = (links ?? []).map((l) => l.agent_id as string)
  const agentBundles: { name: string; files: { name: string; kind: string; content: string }[] }[] = []
  const merged: Record<"soul" | "skills" | "architecture", string[]> = { soul: [], skills: [], architecture: [] }
  if (agentIds.length) {
    const [{ data: agentRows2 }, { data: filesRows }] = await Promise.all([
      sb().from("agents").select("id,name").in("id", agentIds),
      sb().from("agent_files").select("agent_id,name,kind,content").in("agent_id", agentIds),
    ])
    const nameById = new Map((agentRows2 ?? []).map((a) => [a.id as string, a.name as string]))
    const filesByAgent = new Map<string, { name: string; kind: string; content: string }[]>()
    for (const f of filesRows ?? []) {
      const arr = filesByAgent.get(f.agent_id as string) ?? []
      arr.push({ name: f.name as string, kind: f.kind as string, content: f.content as string })
      filesByAgent.set(f.agent_id as string, arr)
    }
    for (const aid of agentIds) {
      const aname = nameById.get(aid)
      if (!aname) continue
      const files = filesByAgent.get(aid) ?? []
      agentBundles.push({ name: aname, files })
      for (const f of files) {
        const low = f.name.toLowerCase()
        const key = low === "soul.md" ? "soul" : low === "skills.md" ? "skills" : low === "architecture.md" ? "architecture" : null
        if (key) merged[key].push(`# ${aname}\n${f.content}`)
      }
    }
  }
  // Merged agent files if any, else the global default.
  const pick = (key: "soul" | "skills" | "architecture") =>
    merged[key].length ? merged[key].join("\n\n---\n\n") : globals[key] ?? ""

  return Response.json({
    user: { id: user.id, name: user.name, role: user.role },
    workspace: ws ? { id: ws.id, name: ws.name, githubRepo: normalizeRepo(ws.githubRepo) } : null,
    project: {
      id: chosen.id,
      name: chosen.name,
      shortCode: chosen.shortCode,
      status: chosen.status,
      branch: branchForProject(chosen.name, chosen.shortCode),
    },
    agentDocs: {
      skills: pick("skills"),
      soul: pick("soul"),
      architecture: pick("architecture"),
    },
    agents: agentBundles,
    sharedDocs: agentBundle(), // doctrine + skills + contracts (written to .rebuild/)
    documents: (docRows ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })),
    tickets: tickets.map((t) => ({
      id: t.id,
      shortId: t.shortId,
      title: t.title,
      description: t.description,
      type: t.type,
      priority: t.priority,
      status: t.status,
      assigneeId: t.assigneeId,
    })),
  })
}
