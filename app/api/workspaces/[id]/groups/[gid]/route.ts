import { requireWorkspace } from "@/lib/auth/guard"
import { audit } from "@/lib/mutations"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

// PATCH /api/workspaces/:id/groups/:gid { name } — rename a group. Admin/lead.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; gid: string }> }
) {
  const { id, gid } = await params
  const access = await requireWorkspace(id, "workspace.edit")
  if (access instanceof Response) return access
  const { name } = (await request.json().catch(() => ({}))) as { name?: string }
  if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 })
  const { error } = await sb()
    .from("project_groups")
    .update({ name: name.trim() })
    .eq("id", gid)
    .eq("workspace_id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}

// DELETE /api/workspaces/:id/groups/:gid — delete a group; its projects become
// ungrouped (not deleted). Admin/lead.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; gid: string }> }
) {
  const { id, gid } = await params
  const access = await requireWorkspace(id, "workspace.edit")
  if (access instanceof Response) return access
  await sb().from("projects").update({ group_id: null }).eq("workspace_id", id).eq("group_id", gid)
  const { error } = await sb().from("project_groups").delete().eq("id", gid).eq("workspace_id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  await audit("group.delete", "ProjectGroup", gid, access.id)
  return Response.json({ ok: true })
}
