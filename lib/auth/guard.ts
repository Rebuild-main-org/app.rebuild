// Centralized authorization guards (MUST-HAVE #1 — anti-IDOR / BOLA).
//
// Every workspace-scoped route MUST resolve the target workspace and call
// requireWorkspace() so that a signed-in user can only touch workspaces they
// belong to. ADMIN bypasses membership (global operator). The data layer uses
// the service-role client (bypasses RLS), so object-level authorization lives
// HERE — there is no second line of defence.
//
// Usage in a route handler:
//   const auth = await requireWorkspace(wsId, "pr.merge")
//   if (auth instanceof Response) return auth
//   const user = auth   // SessionUser, guaranteed member (or ADMIN)

import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { can, type Action } from "@/lib/auth"
import { getSessionUser, type SessionUser } from "@/lib/auth/session"
import type { Role } from "@/lib/types"
import { decideWorkspaceAccess } from "@/lib/auth/decide"

function sb() {
  return supabaseAdmin()
}

const unauthorized = () =>
  Response.json({ error: "Unauthorized" }, { status: 401 })
const forbidden = (msg = "Forbidden") =>
  Response.json({ error: msg }, { status: 403 })
const notFound = () => Response.json({ error: "Not found" }, { status: 404 })

// --- membership --------------------------------------------------------------

export async function isWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  return (await workspaceMemberRole(userId, workspaceId)) !== null
}

// Returns the member's role within a workspace, or null if not a member.
export async function workspaceMemberRole(
  userId: string,
  workspaceId: string
): Promise<Role | null> {
  const { data } = await sb()
    .from("workspace_members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  return (data?.role as Role) ?? null
}

// Require a signed-in user who belongs to `workspaceId` (ADMIN bypasses), and
// optionally satisfies an RBAC action. The action is checked against the user's
// EFFECTIVE role in that workspace (their membership role), not their global
// role — so per-workspace permissions are honoured. Returns SessionUser or Response.
export async function requireWorkspace(
  workspaceId: string | undefined | null,
  action?: Action
): Promise<SessionUser | Response> {
  const user = await getSessionUser()
  // ADMIN / SUPER_ADMIN bypass membership; otherwise look up the workspace role.
  const memberRole =
    user && workspaceId && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN"
      ? await workspaceMemberRole(user.id, workspaceId)
      : null
  const decision = decideWorkspaceAccess({ user, workspaceId, memberRole, action })
  switch (decision) {
    case "unauthenticated":
      return unauthorized()
    case "not-found":
      return notFound()
    case "forbidden-membership":
      return forbidden("Not a member of this workspace")
    case "forbidden-action":
      return forbidden()
    default:
      return user as SessionUser
  }
}

// Require a signed-in user, optionally satisfying a global RBAC action. Use for
// non-workspace resources (admin, CRM, reports, profile, notifications…).
export async function requireAuth(
  action?: Action
): Promise<SessionUser | Response> {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  if (action && !can(user, action)) return forbidden()
  return user
}

// --- workspace resolvers ------------------------------------------------------
// Resolve the owning workspace for a nested resource so the guard can run.

export async function wsIdForProject(projectId: string): Promise<string | null> {
  const { data } = await sb()
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle()
  return (data?.workspace_id as string) ?? null
}

export async function wsIdForTicket(ticketId: string): Promise<string | null> {
  const { data } = await sb()
    .from("tickets")
    .select("project_id")
    .eq("id", ticketId)
    .maybeSingle()
  if (!data?.project_id) return null
  return wsIdForProject(data.project_id as string)
}

export async function wsIdForComment(commentId: string): Promise<string | null> {
  const { data } = await sb()
    .from("comments")
    .select("ticket_id")
    .eq("id", commentId)
    .maybeSingle()
  if (!data?.ticket_id) return null
  return wsIdForTicket(data.ticket_id as string)
}

export async function wsIdForAttachment(
  attachmentId: string
): Promise<string | null> {
  const { data } = await sb()
    .from("ticket_attachments")
    .select("ticket_id")
    .eq("id", attachmentId)
    .maybeSingle()
  if (!data?.ticket_id) return null
  return wsIdForTicket(data.ticket_id as string)
}

export async function wsIdForDocument(
  documentId: string
): Promise<string | null> {
  const { data } = await sb()
    .from("documents")
    .select("workspace_id")
    .eq("id", documentId)
    .maybeSingle()
  return (data?.workspace_id as string) ?? null
}

export async function wsIdForTestCase(testCaseId: string): Promise<string | null> {
  const { data } = await sb()
    .from("test_cases")
    .select("project_id")
    .eq("id", testCaseId)
    .maybeSingle()
  if (!data?.project_id) return null
  return wsIdForProject(data.project_id as string)
}

export async function wsIdForSprint(sprintId: string): Promise<string | null> {
  const { data } = await sb()
    .from("sprints")
    .select("project_id")
    .eq("id", sprintId)
    .maybeSingle()
  if (!data?.project_id) return null
  return wsIdForProject(data.project_id as string)
}

export async function wsIdForMeeting(meetingId: string): Promise<string | null> {
  const { data } = await sb()
    .from("meetings")
    .select("workspace_id")
    .eq("id", meetingId)
    .maybeSingle()
  return (data?.workspace_id as string) ?? null
}

// --- resolve-and-guard convenience wrappers ----------------------------------
// Each resolves the owning workspace for a nested resource, then runs the
// membership + RBAC guard. Returns SessionUser (member/ADMIN) or a Response.

export async function requireProject(
  projectId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(projectId ? await wsIdForProject(projectId) : null, action)
}

export async function requireTicket(
  ticketId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(ticketId ? await wsIdForTicket(ticketId) : null, action)
}

export async function requireComment(
  commentId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(commentId ? await wsIdForComment(commentId) : null, action)
}

export async function requireAttachment(
  attachmentId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(
    attachmentId ? await wsIdForAttachment(attachmentId) : null,
    action
  )
}

export async function requireDocument(
  documentId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(
    documentId ? await wsIdForDocument(documentId) : null,
    action
  )
}

export async function requireTestCase(
  testCaseId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(
    testCaseId ? await wsIdForTestCase(testCaseId) : null,
    action
  )
}

export async function requireSprint(
  sprintId: string | undefined,
  action?: Action
): Promise<SessionUser | Response> {
  return requireWorkspace(sprintId ? await wsIdForSprint(sprintId) : null, action)
}
