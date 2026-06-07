import { SEL, sb } from "@/lib/data"
import { requireProject } from "@/lib/auth/guard"
import { audit } from "@/lib/mutations"
import { PROJECT_STATUS_META, type Project } from "@/lib/types"

// GET /api/projects/:id — project details.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id)
  if (access instanceof Response) return access
  const { data } = await sb().from("projects").select(SEL.project).eq("id", id).maybeSingle()
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(data)
}

// PATCH /api/projects/:id — update a project's status (and optionally name /
// description). SUPER_ADMIN passes via can(); ADMIN/LEAD/PM within their
// workspaces. status is validated against the ProjectStatus enum.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id, "project.update")
  if (access instanceof Response) return access

  const body = (await request.json().catch(() => ({}))) as Partial<Project>
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!(body.status in PROJECT_STATUS_META)) {
      return Response.json({ error: "Invalid status" }, { status: 400 })
    }
    patch.status = body.status
  }
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.description === "string") patch.description = body.description
  if ("groupId" in body) patch.group_id = body.groupId || null // assign/move/ungroup
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await sb()
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select(SEL.project)
    .single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  await audit("project.update", "Project", id, access.id)
  return Response.json(data)
}

// DELETE /api/projects/:id — delete a project (cascades sprints/milestones/
// tickets). ADMIN can delete any project; LEAD/PM within their workspaces.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id, "project.delete")
  if (access instanceof Response) return access
  const { error } = await sb().from("projects").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
