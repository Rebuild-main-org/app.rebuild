import { randomUUID } from "crypto"

import { SEL, getUsersMap, sb } from "@/lib/data"
import { requireAuth } from "@/lib/auth/guard"
import { can } from "@/lib/auth"
import { createNotification } from "@/lib/mutations"
import { SLA_HOURS, type SupportStatus, type TicketPriority } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/support?status= — staff (support.view) see the whole queue; every
// other authenticated user sees only the tickets they opened.
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const status = new URL(request.url).searchParams.get("status")
  let q = sb().from("support_tickets").select(SEL.supportTicket).order("created_at", { ascending: false })
  if (status) q = q.eq("status", status)
  if (!can(auth, "support.view")) {
    // Own tickets only — by requester id, or legacy tickets matched on email.
    q = q.or(`requester_id.eq.${auth.id},requester_email.ilike.${auth.email}`)
  }
  const [{ data }, users] = await Promise.all([q, getUsersMap()])
  return Response.json(
    (data ?? []).map((t) => ({ ...t, assignee: users.get(t.assigneeId as string)?.name }))
  )
}

// POST /api/support — any authenticated user can open a ticket. Super-admins are
// notified so they can handle it.
export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const { subject, body, priority, workspaceId } = (await request.json()) as {
    subject?: string
    body?: string
    priority?: TicketPriority
    workspaceId?: string
  }
  if (!subject?.trim()) {
    return Response.json({ error: "subject is required" }, { status: 400 })
  }
  const prio = priority ?? "MEDIUM"
  const slaDue = new Date(Date.now() + SLA_HOURS[prio] * 3_600_000).toISOString()
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    subject: subject.trim(),
    body: body ?? "",
    requester_email: auth.email,
    requester_id: auth.id,
    status: "NEW" as SupportStatus,
    priority: prio,
    workspace_id: workspaceId ?? null,
    assignee_id: null,
    sla_due_at: slaDue,
    created_at: now,
    updated_at: now,
  }
  const { error } = await sb().from("support_tickets").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  // Notify super-admins that a ticket needs handling.
  const { data: admins } = await sb().from("users").select("id").eq("role", "SUPER_ADMIN")
  for (const a of admins ?? []) {
    if (a.id === auth.id) continue
    await createNotification(
      a.id as string,
      "support_opened",
      `New support ticket: ${row.subject}`,
      `/support?ticket=${row.id}`
    )
  }
  return Response.json(row, { status: 201 })
}

// DELETE /api/support { ids: string[] } | { all: true } — bulk delete tickets
// (SUPER_ADMIN only). Cascades to comments.
export async function DELETE(request: Request) {
  const auth = await requireAuth("support.resolve")
  if (auth instanceof Response) return auth
  const { ids, all } = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean }
  let q = sb().from("support_tickets").delete()
  if (all) {
    q = q.neq("id", "")
  } else {
    const list = (ids ?? []).filter(Boolean)
    if (list.length === 0) return Response.json({ error: "ids or all required" }, { status: 400 })
    q = q.in("id", list)
  }
  const { error } = await q
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
