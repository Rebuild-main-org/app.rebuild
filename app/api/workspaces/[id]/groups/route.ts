import { randomUUID } from "crypto"

import { requireWorkspace } from "@/lib/auth/guard"
import { groupsForWorkspace } from "@/lib/queries"
import { audit } from "@/lib/mutations"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

// GET /api/workspaces/:id/groups — the workspace's project groups.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireWorkspace(id)
  if (access instanceof Response) return access
  return Response.json(await groupsForWorkspace(id))
}

// POST /api/workspaces/:id/groups { name } — create a group. Admin/lead.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireWorkspace(id, "workspace.edit")
  if (access instanceof Response) return access
  const { name } = (await request.json().catch(() => ({}))) as { name?: string }
  if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 })

  const { count } = await sb()
    .from("project_groups")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", id)
  const groupId = randomUUID()
  const { error } = await sb().from("project_groups").insert({
    id: groupId,
    workspace_id: id,
    name: name.trim(),
    position: count ?? 0,
    created_at: new Date().toISOString(),
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  await audit("group.create", "ProjectGroup", groupId, access.id)
  return Response.json({ id: groupId, name: name.trim() }, { status: 201 })
}
