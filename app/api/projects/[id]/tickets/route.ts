import { ticketsForProject } from "@/lib/queries"
import { createTicket } from "@/lib/mutations"
import type { Ticket } from "@/lib/types"
import { requireProject } from "@/lib/auth/guard"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireProject(id)
  if (_access instanceof Response) return _access
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const assignee = searchParams.get("assignee")
  const type = searchParams.get("type")

  let tickets = await ticketsForProject(id)
  if (status) tickets = tickets.filter((t) => t.status === status)
  if (assignee) tickets = tickets.filter((t) => t.assigneeId === assignee)
  if (type) tickets = tickets.filter((t) => t.type === type)

  return Response.json(tickets)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireProject(id)
  if (_access instanceof Response) return _access
  const body = (await request.json()) as Partial<Ticket>
  if (!body.title || !body.type || !body.priority) {
    return Response.json(
      { error: "title, type and priority are required" },
      { status: 400 }
    )
  }
  const ticket = await createTicket(id, {
    title: body.title,
    type: body.type,
    priority: body.priority,
    status: body.status,
    assigneeId: body.assigneeId,
    description: body.description,
    points: body.points,
    labels: body.labels,
    dueDate: body.dueDate,
  })
  return Response.json(ticket, { status: 201 })
}
