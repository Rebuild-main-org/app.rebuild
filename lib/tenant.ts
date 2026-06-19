// Tenant context (Phase 0). Resolves the current request's organization from
// the signed-in user's membership, so:
//   - WRITES can stamp the correct org_id (the RLS insert policy checks it), and
//   - routes have one obvious, hard-to-forget place to get "which org am I in".
//
// This pairs with RLS as the backstop: even if a handler forgets to filter,
// the scoped Supabase client + tenant policies block cross-tenant reads/writes.
// This module supplies the write-side org_id and a friendly 403 for callers
// with no organization.

import "server-only"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/session"

export type OrgRole = "owner" | "admin" | "member" | "guest"

export interface TenantContext {
  orgId: string
  role: OrgRole
  userId: string
}

// Resolve the caller's active organization. A user belongs to exactly one org
// for now (the common freelancer / small-team case). When multi-org membership
// lands, this reads an "active org" cookie/header instead of the first row.
export async function getTenant(): Promise<TenantContext | null> {
  const user = await getSessionUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return { orgId: data.org_id as string, role: data.role as OrgRole, userId: user.id }
}

// Route helper: the tenant context, or a 403 Response. Mirrors lib/auth/guard.ts
// so call sites read the same way: `const t = await requireTenant(); if (t instanceof Response) return t`.
export async function requireTenant(): Promise<TenantContext | Response> {
  const tenant = await getTenant()
  if (!tenant) {
    return Response.json({ error: "No organization for this user" }, { status: 403 })
  }
  return tenant
}
