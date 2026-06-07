import { buildTree } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"

// GET /api/git/:wsId/tree?branch= — repo file tree for a branch.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  return Response.json(buildTree(wsId))
}
