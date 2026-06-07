import { getUsersMap } from "@/lib/data"
import { prsForWorkspace } from "@/lib/queries"
import type { PullRequest } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"

// GET /api/git/:wsId/prs — pull requests for the workspace repo.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const [prs, users] = await Promise.all([prsForWorkspace(wsId), getUsersMap()])
  return Response.json(
    (prs as PullRequest[]).map((p) => ({ ...p, author: users.get(p.authorId) }))
  )
}
