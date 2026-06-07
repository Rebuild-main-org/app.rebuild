import { getSessionUser } from "@/lib/auth/session"
import { deleteComment, editComment } from "@/lib/mutations"

// PATCH /api/comments/:id — edit (author only).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { content } = (await request.json()) as { content?: string }
  if (!content?.trim()) return Response.json({ error: "content required" }, { status: 400 })
  try {
    const ok = await editComment(id, content.trim())
    if (!ok) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 403 })
  }
}

// DELETE /api/comments/:id — author only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  try {
    const ok = await deleteComment(id)
    if (!ok) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 403 })
  }
}
