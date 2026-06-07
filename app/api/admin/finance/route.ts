import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import type { FinanceDoc } from "@/lib/types"

async function guard() {
  const user = await getSessionUser()
  return user && can(user, "billing.manage")
}

export async function GET() {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { data } = await sb().from("finance_docs").select(SEL.financeDoc).order("issue_date", { ascending: false })
  return Response.json(data ?? [])
}

export async function POST(request: Request) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const body = (await request.json()) as Partial<FinanceDoc>
  if (!body.kind || !body.clientName || !body.items?.length) {
    return Response.json({ error: "kind, clientName and items are required" }, { status: 400 })
  }
  const year = new Date().getFullYear()
  const prefix = body.kind === "QUOTE" ? "DEV" : "FAC"
  const { count } = await sb()
    .from("finance_docs")
    .select("id", { count: "exact", head: true })
    .eq("kind", body.kind)
  const row = {
    id: randomUUID(),
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
  const { data, error } = await sb().from("finance_docs").insert(row).select(SEL.financeDoc).single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data, { status: 201 })
}
