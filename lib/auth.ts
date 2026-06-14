// Central RBAC (spec §03). One place to ask "can this role do X" so routes and
// UI stay in sync.

import type { Role, User } from "./types"

export type Action =
  | "workspace.create"
  | "workspace.delete"
  | "workspace.edit"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "ticket.delete"
  | "member.invite"
  | "pr.merge"
  | "pr.approve"
  | "copilot.use"
  | "admin.panel"
  | "billing.manage"
  | "billing.delete"
  | "code.access"
  | "crm.view"
  | "crm.manage"
  | "qa.manage"
  | "support.view"
  | "support.manage"
  | "support.resolve"
  | "notify.broadcast"
  | "ai.feedback.create"
  | "ai.traces.read"

const MATRIX: Record<Action, Role[]> = {
  // Creating a workspace is reserved to the SUPER_ADMIN (it only happens from an
  // approved Blueprint). Empty list ⇒ only SUPER_ADMIN passes via can()'s superuser short-circuit.
  "workspace.create": [],
  "workspace.delete": ["ADMIN"],
  "workspace.edit": ["ADMIN", "LEAD"],
  "project.create": ["ADMIN", "LEAD", "PM"],
  "project.update": ["ADMIN", "LEAD", "PM"],
  "project.delete": ["ADMIN", "LEAD", "PM"],
  "ticket.delete": ["ADMIN", "LEAD", "PM"],
  "member.invite": ["ADMIN", "LEAD"],
  "pr.merge": ["ADMIN", "LEAD"],
  "pr.approve": ["ADMIN", "LEAD", "ENGINEER"],
  // Copilot for all internal staff (everyone except the external client).
  "copilot.use": ["ADMIN", "LEAD", "PM", "ENGINEER", "QA", "DESIGNER", "SALES", "FINANCE", "SUPPORT"],
  "admin.panel": ["ADMIN"],
  "billing.manage": ["ADMIN", "FINANCE"],
  // Deleting quotes/invoices is destructive — admins only (SUPER_ADMIN inherits).
  "billing.delete": ["ADMIN"],
  "code.access": ["ADMIN", "LEAD", "ENGINEER", "QA", "DESIGNER"],
  "crm.view": ["ADMIN", "LEAD", "PM", "SALES"],
  "crm.manage": ["ADMIN", "LEAD", "SALES"],
  // QA can author/run tests; engineers and leads too.
  "qa.manage": ["ADMIN", "LEAD", "PM", "QA", "ENGINEER"],
  "support.view": ["ADMIN", "LEAD", "PM", "SUPPORT"],
  "support.manage": ["ADMIN", "LEAD", "SUPPORT"],
  // Only a SUPER_ADMIN may resolve/handle a user's ticket and broadcast notices.
  "support.resolve": ["SUPER_ADMIN"],
  "notify.broadcast": ["SUPER_ADMIN"],
  // Any internal staff (not the external CLIENT) can rate an AI output they see.
  "ai.feedback.create": ["ADMIN", "LEAD", "PM", "ENGINEER", "QA", "DESIGNER", "SALES", "FINANCE", "SUPPORT"],
  // Reading raw traces / the curated dataset is sensitive — admins only.
  "ai.traces.read": ["ADMIN"],
}

export function can(user: Pick<User, "role"> | undefined, action: Action): boolean {
  if (!user) return false
  // SUPER_ADMIN is an unrestricted superuser — it can do everything.
  if (user.role === "SUPER_ADMIN") return true
  return MATRIX[action].includes(user.role)
}

// Admin-level access: plain ADMIN or the SUPER_ADMIN superuser. Use this instead
// of `role === "ADMIN"` so super-admins inherit every admin capability.
export function isAdmin(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

// Coarse seniority tiers for gates like analytics/reports ("LEAD and above").
// Orthogonal specialist roles map to the IC tier; PM sits at the LEAD tier.
const TIER: Record<Role, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  LEAD: 3,
  PM: 3,
  ENGINEER: 2,
  QA: 2,
  DESIGNER: 2,
  SALES: 2,
  FINANCE: 2,
  SUPPORT: 2,
  CLIENT: 1,
}

export function roleAtLeast(role: Role, min: Role): boolean {
  return TIER[role] >= TIER[min]
}
