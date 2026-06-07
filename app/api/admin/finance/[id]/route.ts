import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb } from "@/lib/data"
import type { DocStatus } from "@/lib/types"

// PATCH /api/admin/finance/:id — update a quote/invoice status.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user || !can(user, "billing.manage")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const { status } = (await request.json()) as { status?: DocStatus }
  if (!status) return Response.json({ error: "status required" }, { status: 400 })
  const { data, error } = await sb()
    .from("finance_docs")
    .update({ status })
    .eq("id", id)
    .select("id,status")
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(data)
}

// DELETE /api/admin/finance/:id — permanently delete a quote/invoice (devis /
// facture). Restricted to ADMIN and SUPER_ADMIN (not FINANCE).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user || !can(user, "billing.delete")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const { data, error } = await sb()
    .from("finance_docs")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json({ ok: true, id: data.id })
}
