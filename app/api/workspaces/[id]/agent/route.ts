import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb } from "@/lib/data"
import { requireWorkspace } from "@/lib/auth/guard"

export const dynamic = "force-dynamic"

// GET /api/workspaces/:id/agent — selected agent ids + the agent library.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireWorkspace(id)
  if (access instanceof Response) return access
  const [{ data: links }, { data: agents }] = await Promise.all([
    sb().from("workspace_agents").select("agent_id").eq("workspace_id", id),
    sb().from("agents").select("id,name,description").order("name"),
  ])
  return Response.json({
    agentIds: (links ?? []).map((l) => l.agent_id as string),
    agents: agents ?? [],
  })
}

// PUT /api/workspaces/:id/agent { agentIds: string[] } — replace the full set.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireWorkspace(id, "workspace.edit")
  if (access instanceof Response) return access
  const user = await getSessionUser()
  if (!user || !can(user, "workspace.edit")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { agentIds } = (await request.json()) as { agentIds?: string[] }
  const ids = [...new Set((agentIds ?? []).filter(Boolean))]

  // Replace the set: clear then insert.
  await sb().from("workspace_agents").delete().eq("workspace_id", id)
  if (ids.length) {
    const now = new Date().toISOString()
    const { error } = await sb()
      .from("workspace_agents")
      .insert(ids.map((agent_id) => ({ workspace_id: id, agent_id, added_at: now })))
    if (error) return Response.json({ error: error.message }, { status: 400 })
  }
  return Response.json({ ok: true })
}
