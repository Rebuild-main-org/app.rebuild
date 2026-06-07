import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import type { Transaction, TxnKind } from "@/lib/types"

export const dynamic = "force-dynamic"

async function guard() {
  const user = await getSessionUser()
  return user && can(user, "billing.manage")
}

// PATCH /api/admin/transactions/:id — edit a charge/revenu (billing.manage).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const body = (await request.json()) as Partial<Transaction>
  const patch: Record<string, unknown> = {}
  if (body.kind) patch.kind = body.kind as TxnKind
  if (body.label !== undefined) patch.label = body.label
  if (body.category !== undefined) patch.category = body.category
  if (body.amount !== undefined) patch.amount = Number(body.amount)
  if (body.date !== undefined) patch.date = body.date
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 })
  }
  const { data, error } = await sb()
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .select(SEL.transaction)
    .single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data)
}

// DELETE /api/admin/transactions/:id — remove a charge/revenu (billing.manage).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const { error } = await sb().from("transactions").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
