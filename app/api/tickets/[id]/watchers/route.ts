import { getSessionUser } from "@/lib/auth/session"
import { addWatcher, removeWatcher } from "@/lib/mutations"
import { requireTicket } from "@/lib/auth/guard"

// POST /api/tickets/:id/watchers — watch (self by default, or {userId}).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string }
  await addWatcher(id, userId ?? user.id)
  return Response.json({ ok: true }, { status: 201 })
}

// DELETE /api/tickets/:id/watchers?userId=
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const userId = new URL(request.url).searchParams.get("userId") ?? user.id
  await removeWatcher(id, userId)
  return Response.json({ ok: true })
}
