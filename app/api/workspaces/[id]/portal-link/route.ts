import { requireWorkspace } from "@/lib/auth/guard"
import { signPortalToken } from "@/lib/portal"
import { appUrl } from "@/lib/email"

// GET /api/workspaces/:id/portal-link — mint a signed client-portal URL.
// Members only (the guard enforces it).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireWorkspace(id, "workspace.edit")
  if (access instanceof Response) return access
  const token = signPortalToken(id)
  return Response.json({ token, url: appUrl(`/client/${token}`) })
}
