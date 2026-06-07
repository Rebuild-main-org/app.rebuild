import { SEL, sb } from "@/lib/data"
import { requireAuth } from "@/lib/auth/guard"
import { createNotification } from "@/lib/mutations"
import type { SupportStatus, SupportTicket } from "@/lib/types"

const STATUSES: SupportStatus[] = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"]

// PATCH /api/support/:id — handle a ticket (status / assignee). Only a
// SUPER_ADMIN may treat tickets. The requester is notified when it's resolved.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("support.resolve")
  if (auth instanceof Response) return auth
  const { id } = await params
  const { status, assigneeId } = (await request.json()) as {
    status?: SupportStatus
    assigneeId?: string | null
  }

  const { data: existing } = await sb()
    .from("support_tickets")
    .select(SEL.supportTicket)
    .eq("id", id)
    .maybeSingle()
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 })
  const ticket = existing as SupportTicket

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { updated_at: now }
  let resolvedNow = false
  if (status) {
    if (!STATUSES.includes(status)) return Response.json({ error: "invalid status" }, { status: 400 })
    patch.status = status
    if ((status === "RESOLVED" || status === "CLOSED") && ticket.status !== status) {
      patch.resolved_by_id = auth.id
      patch.resolved_at = now
      resolvedNow = true
    }
  }
  if (assigneeId !== undefined) patch.assignee_id = assigneeId

  const { error } = await sb().from("support_tickets").update(patch).eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  // Notify the requester their ticket was handled.
  if (resolvedNow && ticket.requesterId && ticket.requesterId !== auth.id) {
    await createNotification(
      ticket.requesterId,
      "support_resolved",
      `Your support ticket "${ticket.subject}" was ${status === "CLOSED" ? "closed" : "resolved"}.`,
      `/support?ticket=${id}`
    )
  }
  return Response.json({ ok: true })
}

// DELETE /api/support/:id — permanently delete a ticket (SUPER_ADMIN only).
// Cascades to its comments.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("support.resolve")
  if (auth instanceof Response) return auth
  const { id } = await params
  const { error } = await sb().from("support_tickets").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
