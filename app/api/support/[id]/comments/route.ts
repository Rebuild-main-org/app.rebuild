import { randomUUID } from "crypto"

import { SEL, getUsersMap, sb } from "@/lib/data"
import { requireAuth } from "@/lib/auth/guard"
import { can } from "@/lib/auth"
import { createNotification } from "@/lib/mutations"
import type { SupportTicket } from "@/lib/types"

export const dynamic = "force-dynamic"

// Access: the ticket's requester, or staff with support.view.
async function loadAccessible(id: string, userId: string, isStaff: boolean) {
  const { data } = await sb().from("support_tickets").select(SEL.supportTicket).eq("id", id).maybeSingle()
  const ticket = data as SupportTicket | null
  if (!ticket) return { error: "Not found", status: 404 as const }
  if (!isStaff && ticket.requesterId !== userId) return { error: "Forbidden", status: 403 as const }
  return { ticket }
}

// GET /api/support/:id/comments — the discussion thread.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const { id } = await params
  const res = await loadAccessible(id, auth.id, can(auth, "support.view"))
  if ("error" in res) return Response.json({ error: res.error }, { status: res.status })

  const [{ data }, users] = await Promise.all([
    sb()
      .from("support_comments")
      .select("id,ticketId:ticket_id,authorId:author_id,content,createdAt:created_at")
      .eq("ticket_id", id)
      .order("created_at"),
    getUsersMap(),
  ])
  return Response.json(
    (data ?? []).map((c) => ({ ...c, authorName: users.get(c.authorId as string)?.name ?? "User" }))
  )
}

// POST /api/support/:id/comments — add to the discussion. Notifies the other side.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const { id } = await params
  const isStaff = can(auth, "support.view")
  const res = await loadAccessible(id, auth.id, isStaff)
  if ("error" in res) return Response.json({ error: res.error }, { status: res.status })
  const ticket = res.ticket

  const { content } = (await request.json()) as { content?: string }
  if (!content?.trim()) return Response.json({ error: "content is required" }, { status: 400 })
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    ticket_id: id,
    author_id: auth.id,
    content: content.trim(),
    created_at: now,
  }
  const { error } = await sb().from("support_comments").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  await sb().from("support_tickets").update({ updated_at: now }).eq("id", id)

  const link = `/support?ticket=${id}`
  if (isStaff && auth.id !== ticket.requesterId) {
    // Staff replied → notify the requester.
    if (ticket.requesterId) {
      await createNotification(ticket.requesterId, "support_reply", `New reply on "${ticket.subject}"`, link)
    }
  } else {
    // Requester replied → notify the super-admins (and assignee).
    const { data: admins } = await sb().from("users").select("id").eq("role", "SUPER_ADMIN")
    const targets = new Set<string>((admins ?? []).map((a) => a.id as string))
    if (ticket.assigneeId) targets.add(ticket.assigneeId)
    for (const uid of targets) {
      if (uid === auth.id) continue
      await createNotification(uid, "support_reply", `New reply on "${ticket.subject}"`, link)
    }
  }
  return Response.json({ ...row, authorName: auth.name }, { status: 201 })
}
