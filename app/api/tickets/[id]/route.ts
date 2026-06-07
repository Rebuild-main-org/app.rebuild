import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { deleteTicket, updateTicket } from "@/lib/mutations"
import type { Activity, Comment, Ticket } from "@/lib/types"
import { requireTicket } from "@/lib/auth/guard"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const { data: ticket } = await sb().from("tickets").select(SEL.ticket).eq("id", id).maybeSingle()
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 })

  const t = ticket as Ticket
  const [
    { data: comments },
    { data: activity },
    { data: subtasks },
    { data: linksFrom },
    { data: linksTo },
    { data: watchers },
    { data: attachments },
    users,
  ] = await Promise.all([
    sb().from("comments").select(SEL.comment).eq("ticket_id", id).order("created_at"),
    sb().from("activities").select(SEL.activity).eq("ticket_id", id).order("created_at"),
    sb().from("tickets").select(SEL.ticket).eq("parent_id", id).order("order"),
    sb().from("ticket_links").select(SEL.ticketLink).eq("from_ticket_id", id),
    sb().from("ticket_links").select(SEL.ticketLink).eq("to_ticket_id", id),
    sb().from("ticket_watchers").select("user_id").eq("ticket_id", id),
    sb().from("ticket_attachments").select(SEL.attachment).eq("ticket_id", id).order("created_at"),
    getUsersMap(),
  ])

  const linkRows = [
    ...((linksFrom ?? []) as { id: string; toTicketId: string; type: string }[]).map((l) => ({ id: l.id, type: l.type, dir: "out" as const, otherId: l.toTicketId })),
    ...((linksTo ?? []) as { id: string; fromTicketId: string; type: string }[]).map((l) => ({ id: l.id, type: l.type, dir: "in" as const, otherId: l.fromTicketId })),
  ]
  const otherIds = [...new Set(linkRows.map((l) => l.otherId))]
  const otherMap = new Map<string, { shortId: string; title: string; status: string }>()
  if (otherIds.length) {
    const { data: others } = await sb().from("tickets").select("id,shortId:short_id,title,status").in("id", otherIds)
    for (const o of others ?? []) otherMap.set(o.id as string, { shortId: o.shortId as string, title: o.title as string, status: o.status as string })
  }

  return Response.json({
    ticket: t,
    comments: ((comments ?? []) as Comment[]).map((c) => ({ ...c, author: users.get(c.authorId) })),
    activity: ((activity ?? []) as Activity[]).map((a) => ({ ...a, actor: users.get(a.actorId) })),
    subtasks: (subtasks ?? []) as Ticket[],
    links: linkRows.map((l) => ({ id: l.id, type: l.type, dir: l.dir, other: otherMap.get(l.otherId) })),
    watchers: (watchers ?? []).map((w) => users.get(w.user_id as string)).filter(Boolean),
    attachments: attachments ?? [],
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const patch = (await request.json()) as Partial<Ticket>
  const ticket = await updateTicket(id, patch)
  if (!ticket) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(ticket)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "ticket.delete")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const ok = await deleteTicket(id)
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json({ ok: true })
}
