import { getSessionUser, resolveAppUser } from "@/lib/auth/session"
import { workspacesForUser } from "@/lib/queries"

export const dynamic = "force-dynamic"

// GET /api/auth/me — the authenticated user + their workspaces.
export async function GET() {
  const session = await getSessionUser()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const user = await resolveAppUser(session)
  const workspaces = await workspacesForUser(user.id, user.role)
  return Response.json({ user, workspaces })
}
