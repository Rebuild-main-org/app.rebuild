import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghCommitDiff, githubEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/git/:wsId/commit/:sha — a commit's diff (before/after).
export async function GET(_request: Request, { params }: { params: Promise<{ wsId: string; sha: string }> }) {
  const { wsId, sha } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) return Response.json({ error: "GitHub not connected" }, { status: 400 })
  const diff = await ghCommitDiff(ws.githubRepo, sha)
  if (!diff) return Response.json({ error: "Commit not found" }, { status: 404 })
  return Response.json(diff)
}
