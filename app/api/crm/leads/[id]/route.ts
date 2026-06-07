import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import type { Lead, LeadStage } from "@/lib/types"

// PATCH /api/crm/leads/:id — update stage or fields (crm.manage).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "crm.manage")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const patch = (await request.json()) as Partial<Lead>
  const row: Record<string, unknown> = {}
  if (patch.stage !== undefined) row.stage = patch.stage as LeadStage
  if (patch.company !== undefined) row.company = patch.company
  if (patch.contactName !== undefined) row.contact_name = patch.contactName
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail
  if (patch.value !== undefined) row.value = Number(patch.value)
  if (patch.currency !== undefined) row.currency = patch.currency
  if (patch.source !== undefined) row.source = patch.source
  if (patch.notes !== undefined) row.notes = patch.notes
  if (patch.ownerId !== undefined) row.owner_id = patch.ownerId

  const { data, error } = await sb().from("leads").update(row).eq("id", id).select(SEL.lead).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(data)
}

// DELETE /api/crm/leads/:id (crm.manage).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "crm.manage")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  await sb().from("leads").delete().eq("id", id)
  return Response.json({ ok: true })
}
