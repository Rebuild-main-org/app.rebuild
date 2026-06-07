// Pure authorization decisions, separated from IO so they can be unit-tested.
// The guard (lib/auth/guard.ts) does the IO (session + membership lookup) then
// delegates the verdict here.

import { can, type Action } from "@/lib/auth"
import type { Role } from "@/lib/types"

export type AccessDecision =
  | "unauthenticated"
  | "not-found"
  | "forbidden-membership"
  | "forbidden-action"
  | "ok"

// Effective role inside a workspace: ADMIN is global; otherwise the member's
// workspace role governs in-workspace actions.
export function effectiveWorkspaceRole(
  globalRole: Role,
  memberRole: Role | null
): Role | null {
  if (globalRole === "ADMIN" || globalRole === "SUPER_ADMIN") return "ADMIN"
  return memberRole // null = not a member
}

export function decideWorkspaceAccess(opts: {
  user: { role: Role } | null
  workspaceId: string | null | undefined
  memberRole: Role | null
  action?: Action
}): AccessDecision {
  const { user, workspaceId, memberRole, action } = opts
  if (!user) return "unauthenticated"
  if (!workspaceId) return "not-found"
  const role = effectiveWorkspaceRole(user.role, memberRole)
  if (role === null) return "forbidden-membership"
  if (action && !can({ role }, action)) return "forbidden-action"
  return "ok"
}
