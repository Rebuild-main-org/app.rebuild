import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { requireTenant } from "@/lib/tenant"
import { SEL } from "@/lib/data"
import type { FinanceDoc } from "@/lib/types"

export const dynamic = "force-dynamic"

// `can(...)` gates the *capability* (billing.manage). The SCOPED client + RLS
// gate the *rows* (only the caller's org) — so a forgotten filter can no longer
// leak another tenant's finance docs. This is the model every domain migrates to.
async function guard() {
  const user = await getSessionUser()
  if (!user || !can(user, "billing.manage")) return null
  return user
}

export async function GET() {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const supabase = await createClient()
  // No explicit org filter needed: RLS restricts rows to the caller's org(s).
  const { data } = await supabase
    .from("finance_docs")
    .select(SEL.financeDoc)
    .order("issue_date", { ascending: false })
  return Response.json(data ?? [])
}

export async function POST(request: Request) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const tenant = await requireTenant()
  if (tenant instanceof Response) return tenant

  const body = (await request.json()) as Partial<FinanceDoc>
  if (!body.kind || !body.clientName || !body.items?.length) {
    return Response.json({ error: "kind, clientName and items are required" }, { status: 400 })
  }

  const supabase = await createClient()
  const year = new Date().getFullYear()
  const prefix = body.kind === "QUOTE" ? "DEV" : "FAC"
  // Numbering is now per-org: RLS scopes this count to the caller's org.
  const { count } = await supabase
    .from("finance_docs")
    .select("id", { count: "exact", head: true })
    .eq("kind", body.kind)

  const row = {
    id: randomUUID(),
    org_id: tenant.orgId, // tenant stamp — checked by the RLS insert policy
    kind: body.kind,
    number: `${prefix}-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`,
    workspace_id: body.workspaceId ?? null,
    client_name: body.clientName,
    issue_date: body.issueDate ?? new Date().toISOString(),
    due_date: body.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString(),
    status: body.status ?? "DRAFT",
    items: body.items,
    tax_rate: body.taxRate ?? 19,
    currency: body.currency ?? "TND",
    notes: body.notes ?? null,
  }
  const { data, error } = await supabase
    .from("finance_docs")
    .insert(row)
    .select(SEL.financeDoc)
    .single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data, { status: 201 })
}
