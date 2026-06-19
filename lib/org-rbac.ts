// Phase 2 RBAC — org-level roles + capabilities.
//
// Collapses the 11 platform-global roles (lib/types.ts `Role`) into 4 ORG roles
// and expresses authorization as CAPABILITIES, decoupled from job specialties.
// The old specialty roles (ENGINEER/QA/DESIGNER/SALES/FINANCE/SUPPORT/PM/LEAD)
// become profile LABELS used for assignment & filtering, not access — so a
// non-technical member no longer inherits code access by construction.
//
// Additive for now: this does not yet replace lib/auth.ts `can()`. Routes move
// from `can(user, action)` to `orgCan(tenant.role, capability)` as each domain
// adopts the tenant model (lib/tenant.ts). The "developer surface" (IDE/Git/CI)
// is gated by `code.access`, which members do NOT get by default — it is granted
// per-org ("developer mode") or per-member (Phase 3/4), matching §3.2.

import type { OrgRole } from "@/lib/tenant"

export type Capability =
  | "org.manage" // org settings, members, integrations, secrets
  | "billing.manage" // platform subscription + finance/transactions
  | "project.manage" // create/update/delete projects, tickets, milestones
  | "project.view"
  | "crm.manage"
  | "crm.view"
  | "support.manage"
  | "support.view"
  | "code.access" // IDE / Git / CI / CLI — the developer surface
  | "portal.only" // client portal, nothing else

// Base grants per role. `owner` is intentionally omitted: it is a superuser
// within its org (see orgCan) and implicitly holds every capability.
const CAPS: Record<Exclude<OrgRole, "owner">, Capability[]> = {
  admin: [
    "project.manage",
    "project.view",
    "crm.manage",
    "crm.view",
    "support.manage",
    "support.view",
    "code.access",
  ],
  member: ["project.view", "crm.view", "support.view"],
  guest: ["portal.only"],
}

export function orgCan(role: OrgRole, cap: Capability): boolean {
  if (role === "owner") return true // org superuser
  return CAPS[role].includes(cap)
}

export function capabilitiesFor(role: OrgRole): Capability[] {
  if (role === "owner") {
    // Every capability except the portal-only marker.
    const all = new Set<Capability>()
    for (const caps of Object.values(CAPS)) caps.forEach((c) => all.add(c))
    all.add("org.manage")
    all.add("billing.manage")
    all.delete("portal.only")
    return [...all]
  }
  return [...CAPS[role]]
}
