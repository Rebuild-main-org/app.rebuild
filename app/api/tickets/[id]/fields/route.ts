import { sb } from "@/lib/data"
import { requireTicket } from "@/lib/auth/guard"

// GET /api/tickets/:id/fields — custom field values for a ticket.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireTicket(id)
  if (access instanceof Response) return access
  const { data } = await sb()
    .from("ticket_field_values")
    .select("fieldId:field_id,ticketId:ticket_id,value")
    .eq("ticket_id", id)
  return Response.json(data ?? [])
}

// PUT /api/tickets/:id/fields — upsert a field value. Body: { fieldId, value }.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireTicket(id)
  if (access instanceof Response) return access
  const { fieldId, value } = (await request.json()) as { fieldId?: string; value?: string }
  if (!fieldId) return Response.json({ error: "fieldId required" }, { status: 400 })
  const { error } = await sb()
    .from("ticket_field_values")
    .upsert(
      { field_id: fieldId, ticket_id: id, value: value ?? "" },
      { onConflict: "field_id,ticket_id" }
    )
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
