import { getSessionUser } from "@/lib/auth/session"
import { requireTenant } from "@/lib/tenant"
import { orgCan } from "@/lib/org-rbac"
import { createSubscriptionCheckout } from "@/lib/billing"
import { appUrl } from "@/lib/email"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/billing/checkout — start a Pro subscription for the caller's org.
// Seats = current org member count. Uses the new org-capability model (orgCan).
export async function POST() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const tenant = await requireTenant()
  if (tenant instanceof Response) return tenant
  if (!orgCan(tenant.role, "billing.manage")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { count } = await supabaseAdmin()
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", tenant.orgId)

  const session = await createSubscriptionCheckout({
    orgId: tenant.orgId,
    seats: count ?? 1,
    successUrl: appUrl("/settings/billing?ok=1"),
    cancelUrl: appUrl("/settings/billing"),
    customerEmail: user.email,
  })
  if (!session) return Response.json({ error: "Billing not configured" }, { status: 503 })
  return Response.json(session)
}
