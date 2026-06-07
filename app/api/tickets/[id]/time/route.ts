import { getUsersMap } from "@/lib/data"
import { requireTicket } from "@/lib/auth/guard"
import { timeEntriesForTicket, totalMinutesForTicket } from "@/lib/queries"
import { addTimeEntry } from "@/lib/mutations"

// GET /api/tickets/:id/time — time entries + total minutes for a ticket.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireTicket(id)
  if (access instanceof Response) return access
  const [entries, totalMinutes, users] = await Promise.all([
    timeEntriesForTicket(id),
    totalMinutesForTicket(id),
    getUsersMap(),
  ])
  return Response.json({
    totalMinutes,
    entries: entries.map((e) => ({ ...e, user: users.get(e.userId)?.name })),
  })
}

// POST /api/tickets/:id/time — log time. Body: { minutes, note?, spentOn? }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireTicket(id, "code.access")
  if (access instanceof Response) return access
  const { minutes, note, spentOn } = (await request.json()) as {
    minutes?: number
    note?: string
    spentOn?: string
  }
  if (!minutes || minutes <= 0) {
    return Response.json({ error: "minutes must be a positive number" }, { status: 400 })
  }
  try {
    const entry = await addTimeEntry(id, Math.round(minutes), { note, spentOn })
    return Response.json(entry, { status: 201 })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    )
  }
}
