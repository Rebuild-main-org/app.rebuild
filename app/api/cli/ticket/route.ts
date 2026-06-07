import { randomUUID } from "crypto"

import { sb } from "@/lib/data"
import { userFromBearer } from "@/lib/cli-auth"
import { wsIdForTicket, isWorkspaceMember } from "@/lib/auth/guard"
import { isAdmin } from "@/lib/auth"
import { emit } from "@/lib/events"
import { TICKET_STATUSES, type TicketStatus } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST /api/cli/ticket { ticketId, status?, comment? } — CLI ticket updates
// (Bearer auth). Used by the rebuild216 MCP server.
export async function POST(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { ticketId, status, comment } = (await request.json()) as {
    ticketId?: string
    status?: TicketStatus
    comment?: string
  }
  if (!ticketId) return Response.json({ error: "ticketId required" }, { status: 400 })

  const wsId = await wsIdForTicket(ticketId)
  if (!wsId) return Response.json({ error: "Ticket not found" }, { status: 404 })
  if (!isAdmin(user.role) && !(await isWorkspaceMember(user.id, wsId))) {
    return Response.json({ error: "No access to this workspace" }, { status: 403 })
  }

  if (status) {
    if (!TICKET_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 })
    }
    // Quality gate: a ticket can't jump straight to DONE — it must have been
    // worked (IN_PROGRESS) and ideally reviewed (IN_REVIEW) first.
    if (status === "DONE") {
      const { data: t } = await sb()
        .from("tickets")
        .select("short_id,status,description")
        .eq("id", ticketId)
        .maybeSingle()
      const cur = (t?.status as string) ?? ""
      if (cur !== "IN_PROGRESS" && cur !== "IN_REVIEW") {
        return Response.json(
          { error: `Cannot mark ${t?.short_id ?? "ticket"} DONE from "${cur || "BACKLOG"}". Move it to IN_PROGRESS, then IN_REVIEW after verification, first.` },
          { status: 409 }
        )
      }
      // Definition-of-Done gate (agent_contracts/TICKET_CONTRACT.md §3): if the
      // ticket carries a parsable DoD, every `dod:` box must be [x] or justified
      // N/A. Tickets without a DoD block are unaffected (backward compatible).
      const desc = (t?.description as string) ?? ""
      const unmet = desc
        .split(/\r?\n/)
        .filter((l) => /^\s*-\s*\[ \]\s*dod:/i.test(l) && !/N\/A/i.test(l))
        .map((l) => (l.match(/dod:[\w-]+/i)?.[0] ?? l.trim()))
      if (unmet.length) {
        return Response.json(
          { error: `Definition of Done incomplète pour ${t?.short_id ?? "ticket"} : ${unmet.join(", ")}. Coche chaque case (ou justifie N/A) avant DONE.` },
          { status: 409 }
        )
      }
    }
    const now = new Date().toISOString()
    await sb().from("tickets").update({ status, updated_at: now }).eq("id", ticketId)
    await sb().from("activities").insert({
      id: randomUUID(),
      ticket_id: ticketId,
      kind: "status_changed",
      actor_id: user.id,
      message: `moved to ${status} (via rebuild216)`,
      created_at: now,
    })
    emit([`ticket:${ticketId}`, `ws:${wsId}`], "ticket.updated", { ticketId })
  }

  if (comment?.trim()) {
    const now = new Date().toISOString()
    await sb().from("comments").insert({
      id: randomUUID(),
      content: comment.trim(),
      ticket_id: ticketId,
      author_id: user.id,
      created_at: now,
      updated_at: now,
    })
    emit([`ticket:${ticketId}`], "comment.added", { ticketId })
  }

  return Response.json({ ok: true })
}
