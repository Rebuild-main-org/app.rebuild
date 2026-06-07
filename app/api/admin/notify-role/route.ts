import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb } from "@/lib/data"
import { createNotification } from "@/lib/mutations"
import { ALL_ROLES, type Role } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST /api/admin/notify-role { role, message, linkUrl? } — push a notification
// to every user of a role (or "ALL"). SUPER_ADMIN only.
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || !can(user, "notify.broadcast")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { role, message, linkUrl } = (await request.json()) as {
    role?: Role | "ALL"
    message?: string
    linkUrl?: string
  }
  if (!message?.trim()) return Response.json({ error: "message is required" }, { status: 400 })
  if (role !== "ALL" && !ALL_ROLES.includes(role as Role)) {
    return Response.json({ error: "invalid role" }, { status: 400 })
  }

  let q = sb().from("users").select("id")
  if (role !== "ALL") q = q.eq("role", role)
  const { data: users, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 400 })

  const link = linkUrl?.trim() || undefined
  let sent = 0
  for (const u of users ?? []) {
    await createNotification(u.id as string, "broadcast", message.trim(), link)
    sent++
  }
  return Response.json({ ok: true, sent })
}
