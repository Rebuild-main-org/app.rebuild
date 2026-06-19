import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { requireTenant } from "@/lib/tenant"
import { sbScoped, SEL } from "@/lib/data-scoped"
import type { Lead } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/crm/leads — pipeline (crm.view). RLS scopes rows to the caller's org.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "crm.view")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const supabase = await sbScoped()
  const { data, error } = await supabase
    .from("leads")
    .select(SEL.lead)
    .order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}

// POST /api/crm/leads — create a lead (crm.manage).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "crm.manage")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const tenant = await requireTenant()
  if (tenant instanceof Response) return tenant

  const body = (await request.json()) as Partial<Lead>
  if (!body.company?.trim()) {
    return Response.json({ error: "company is required" }, { status: 400 })
  }
  const row = {
    id: randomUUID(),
    org_id: tenant.orgId, // tenant stamp — checked by the RLS insert policy
    company: body.company.trim(),
    contact_name: body.contactName ?? "",
    contact_email: body.contactEmail ?? "",
    stage: body.stage ?? "LEAD",
    value: Number(body.value ?? 0),
    currency: body.currency ?? "TND",
    source: body.source ?? "",
    owner_id: body.ownerId ?? user.id,
    notes: body.notes ?? null,
  }
  const supabase = await sbScoped()
  const { data, error } = await supabase.from("leads").insert(row).select(SEL.lead).single()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(data, { status: 201 })
}
