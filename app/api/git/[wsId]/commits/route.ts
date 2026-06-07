import { getUsersMap } from "@/lib/data"
import { commitsForWorkspace } from "@/lib/queries"
import type { GitCommit } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"

// GET /api/git/:wsId/commits?branch= — commit history.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const branch = new URL(request.url).searchParams.get("branch")
  const [commits, users] = await Promise.all([
    commitsForWorkspace(wsId),
    getUsersMap(),
  ])
  return Response.json(
    (commits as GitCommit[])
      .filter((c) => !branch || c.branch === branch)
      .map((c) => ({ ...c, author: users.get(c.authorId) }))
  )
}
