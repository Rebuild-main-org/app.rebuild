import { getSessionUser } from "@/lib/auth/session"
import { notificationsForUser } from "@/lib/queries"
import { sb } from "@/lib/data"
import { parsePage, paged } from "@/lib/pagination"

export const dynamic = "force-dynamic"

// GET /api/notifications?limit=&offset= — newest first, paginated envelope.
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const page = parsePage(request.url, 30, 100)
  const items = await notificationsForUser(user.id, page)
  return Response.json(paged(items, page))
}

// PATCH /api/notifications — mark one ({id}) or all ({all:true}) as read.
export async function PATCH(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id, all } = (await request.json()) as { id?: string; all?: boolean }
  let q = sb().from("notifications").update({ read: true }).eq("user_id", user.id)
  if (!all && id) q = q.eq("id", id)
  if (!all && !id) return Response.json({ error: "id or all required" }, { status: 400 })
  await q
  return Response.json({ ok: true })
}

// DELETE /api/notifications — delete one ({id}) or all ({all:true}) of the
// caller's own notifications.
export async function DELETE(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id, all } = (await request.json().catch(() => ({}))) as { id?: string; all?: boolean }
  let q = sb().from("notifications").delete().eq("user_id", user.id)
  if (all) {
    /* delete all of mine */
  } else if (id) {
    q = q.eq("id", id)
  } else {
    return Response.json({ error: "id or all required" }, { status: 400 })
  }
  const { error } = await q
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
