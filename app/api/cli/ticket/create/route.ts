import { randomUUID } from "crypto"

import { SEL, sb } from "@/lib/data"
import { userFromBearer } from "@/lib/cli-auth"
import { isWorkspaceMember } from "@/lib/auth/guard"
import { isAdmin } from "@/lib/auth"
import { nextTicketNumberFromShortIds } from "@/lib/ticket-number"
import { emit } from "@/lib/events"
import type { LinkType, Project, Ticket, TicketPriority, TicketStatus, TicketType } from "@/lib/types"
import { TICKET_STATUSES } from "@/lib/types"

export const dynamic = "force-dynamic"

const TYPES: TicketType[] = ["TASK", "BUG", "FEATURE", "REVIEW", "EPIC", "SPIKE", "SUBTASK"]
const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
const LINK_TYPES: LinkType[] = ["BLOCKS", "RELATES", "DUPLICATES"]

// Resolve a ticket short id (e.g. "ACME-142") to its uuid within a project.
async function ticketIdByShortId(projectId: string, shortId: string): Promise<string | null> {
  const { data } = await sb()
    .from("tickets")
    .select("id")
    .eq("project_id", projectId)
    .ilike("short_id", shortId.trim())
    .maybeSingle()
  return (data?.id as string) ?? null
}

// POST /api/cli/ticket/create (Bearer) — create a fully-populated ticket on the
// board. Body: { project, title, type?, priority?, status?, description?,
//   points?, labels?, dueDate?, assignee? ("me" | email), parentShortId?,
//   links?: [{ toShortId, type }], comment?, timeMinutes?, timeNote? }.
export async function POST(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json()) as {
    project?: string
    title?: string
    type?: TicketType
    priority?: TicketPriority
    status?: TicketStatus
    description?: string
    points?: number
    labels?: string[]
    dueDate?: string
    assignee?: string
    parentShortId?: string
    links?: { toShortId?: string; type?: LinkType }[]
    comment?: string
    timeMinutes?: number
    timeNote?: string
  }
  const q = body.project?.trim()
  const title = body.title?.trim()
  if (!q) return Response.json({ error: "project is required" }, { status: 400 })
  if (!title) return Response.json({ error: "title is required" }, { status: 400 })

  const type: TicketType = TYPES.includes(body.type as TicketType) ? (body.type as TicketType) : "TASK"
  const priority: TicketPriority = PRIORITIES.includes(body.priority as TicketPriority)
    ? (body.priority as TicketPriority)
    : "MEDIUM"
  const status: TicketStatus = TICKET_STATUSES.includes(body.status as TicketStatus)
    ? (body.status as TicketStatus)
    : "BACKLOG"

  // Resolve the project by name or short code (mirrors /api/cli/context).
  const { data: projRows } = await sb()
    .from("projects")
    .select(SEL.project)
    .or(`name.ilike.${q},short_code.ilike.${q}`)
  const projects = (projRows ?? []) as Project[]
  let chosen: Project | undefined
  for (const p of projects) {
    if (isAdmin(user.role) || (await isWorkspaceMember(user.id, p.workspaceId))) {
      chosen = p
      break
    }
  }
  if (!chosen) return Response.json({ error: `No accessible project "${q}"` }, { status: 403 })

  // Resolve assignee: "me" → caller; otherwise an email (must be a workspace member).
  let assigneeId: string | null = null
  const assignee = body.assignee?.trim()
  if (assignee) {
    if (assignee.toLowerCase() === "me") {
      assigneeId = user.id
    } else {
      const { data: u } = await sb().from("users").select("id").ilike("email", assignee).maybeSingle()
      if (u?.id && (await isWorkspaceMember(u.id as string, chosen.workspaceId))) {
        assigneeId = u.id as string
      }
    }
  }

  // Resolve parent (sub-task) within the same project.
  let parentId: string | null = null
  if (body.parentShortId?.trim()) {
    parentId = await ticketIdByShortId(chosen.id, body.parentShortId)
  }

  // Allocate the ticket number atomically (RPC), falling back to max+1.
  const shortCode = chosen.shortCode || "TASK"
  let nextNum: number
  const { data: seq, error: seqErr } = await sb().rpc("next_ticket_number", { p_project_id: chosen.id })
  if (!seqErr && typeof seq === "number") {
    nextNum = seq
  } else {
    const { data: existing } = await sb().from("tickets").select("short_id").eq("project_id", chosen.id)
    nextNum = nextTicketNumberFromShortIds((existing ?? []).map((t) => String(t.short_id)))
  }

  const { count } = await sb()
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", chosen.id)
  const now = new Date().toISOString()
  const id = randomUUID()
  const row = {
    id,
    short_id: `${shortCode}-${nextNum}`,
    title,
    description: body.description ?? "",
    type,
    priority,
    status,
    project_id: chosen.id,
    assignee_id: assigneeId,
    reporter_id: user.id,
    labels: Array.isArray(body.labels) ? body.labels.filter((l) => typeof l === "string") : [],
    parent_id: parentId,
    points: typeof body.points === "number" ? body.points : null,
    due_date: body.dueDate ?? null,
    order: (count ?? 0) + 1,
    created_at: now,
    updated_at: now,
  }
  const { data, error } = await sb().from("tickets").insert(row).select(SEL.ticket).single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  const ticket = data as Ticket

  // Optional: linked issues.
  const linkedCreated: string[] = []
  for (const link of body.links ?? []) {
    if (!link?.toShortId) continue
    const toId = await ticketIdByShortId(chosen.id, link.toShortId)
    if (!toId || toId === ticket.id) continue
    const linkType: LinkType = LINK_TYPES.includes(link.type as LinkType) ? (link.type as LinkType) : "RELATES"
    const { error: linkErr } = await sb().from("ticket_links").insert({
      id: randomUUID(),
      from_ticket_id: ticket.id,
      to_ticket_id: toId,
      type: linkType,
      created_at: now,
    })
    if (!linkErr) linkedCreated.push(link.toShortId.trim())
  }

  // Optional: initial comment.
  if (body.comment?.trim()) {
    await sb().from("comments").insert({
      id: randomUUID(),
      content: body.comment.trim(),
      ticket_id: ticket.id,
      author_id: user.id,
      created_at: now,
      updated_at: now,
    })
  }

  // Optional: time logged.
  if (typeof body.timeMinutes === "number" && body.timeMinutes > 0) {
    await sb().from("time_entries").insert({
      id: randomUUID(),
      ticket_id: ticket.id,
      user_id: user.id,
      minutes: Math.round(body.timeMinutes),
      note: body.timeNote ?? null,
      spent_on: now.slice(0, 10),
      created_at: now,
    })
  }

  await sb().from("activities").insert({
    id: randomUUID(),
    ticket_id: ticket.id,
    kind: "created",
    actor_id: user.id,
    message: "created this ticket (via rebuild216)",
    created_at: now,
  })
  emit([`project:${chosen.id}`, `ws:${chosen.workspaceId}`], "ticket.created", { ticket }, user.id)

  return Response.json({
    id: ticket.id,
    shortId: ticket.shortId,
    title: ticket.title,
    status: ticket.status,
    assigneeId: ticket.assigneeId,
    parentId: ticket.parentId,
    links: linkedCreated,
  })
}
