import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import type { Transaction } from "@/lib/types"

async function guard() {
  const user = await getSessionUser()
  return user && can(user, "billing.manage")
}

export async function GET() {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { data } = await sb().from("transactions").select(SEL.transaction).order("date", { ascending: false })
  return Response.json(data ?? [])
}

export async function POST(request: Request) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const body = (await request.json()) as Partial<Transaction>
  if (!body.kind || !body.label || body.amount == null) {
    return Response.json({ error: "kind, label and amount are required" }, { status: 400 })
  }
  const row = {
    id: randomUUID(),
    kind: body.kind,
    label: body.label,
    category: body.category ?? "General",
    amount: Number(body.amount),
    date: body.date ?? new Date().toISOString(),
    workspace_id: body.workspaceId ?? null,
  }
  const { data, error } = await sb().from("transactions").insert(row).select(SEL.transaction).single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data, { status: 201 })
}
