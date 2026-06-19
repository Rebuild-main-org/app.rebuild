import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { requireTenant } from "@/lib/tenant"
import { sbScoped, SEL } from "@/lib/data-scoped"
import type { Transaction } from "@/lib/types"

export const dynamic = "force-dynamic"

async function guard() {
  const user = await getSessionUser()
  if (!user || !can(user, "billing.manage")) return null
  return user
}

export async function GET() {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const supabase = await sbScoped()
  // RLS restricts rows to the caller's org.
  const { data } = await supabase
    .from("transactions")
    .select(SEL.transaction)
    .order("date", { ascending: false })
  return Response.json(data ?? [])
}

export async function POST(request: Request) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const tenant = await requireTenant()
  if (tenant instanceof Response) return tenant

  const body = (await request.json()) as Partial<Transaction>
  if (!body.kind || !body.label || body.amount == null) {
    return Response.json({ error: "kind, label and amount are required" }, { status: 400 })
  }
  const row = {
    id: randomUUID(),
    org_id: tenant.orgId, // tenant stamp — checked by the RLS insert policy
    kind: body.kind,
    label: body.label,
    category: body.category ?? "General",
    amount: Number(body.amount),
    date: body.date ?? new Date().toISOString(),
    workspace_id: body.workspaceId ?? null,
  }
  const supabase = await sbScoped()
  const { data, error } = await supabase
    .from("transactions")
    .insert(row)
    .select(SEL.transaction)
    .single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data, { status: 201 })
}
