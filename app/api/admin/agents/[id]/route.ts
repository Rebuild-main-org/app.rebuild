import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

async function requireSuper() {
  const user = await getSessionUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (!isAdmin(user.role)) return { error: "Forbidden", status: 403 as const }
  return { user }
}

// GET /api/admin/agents/:id — agent + its files.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  const [{ data: agent }, { data: files }] = await Promise.all([
    sb().from("agents").select("id,name,description").eq("id", id).maybeSingle(),
    sb().from("agent_files").select("id,agentId:agent_id,name,kind,content,updatedAt:updated_at").eq("agent_id", id).order("name"),
  ])
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json({ agent, files: files ?? [] })
}

// PATCH /api/admin/agents/:id { name?, description? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  const { name, description } = (await request.json()) as { name?: string; description?: string }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) patch.name = name.trim()
  if (description !== undefined) patch.description = description
  const { error } = await sb().from("agents").update(patch).eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}

// DELETE /api/admin/agents/:id — remove an agent (cascades files).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  const { error } = await sb().from("agents").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
