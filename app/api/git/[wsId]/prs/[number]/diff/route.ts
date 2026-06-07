import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghPrDetail, githubEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/git/:wsId/prs/:number/diff — PR file diffs + CI checks (from GitHub).
export async function GET(_request: Request, { params }: { params: Promise<{ wsId: string; number: string }> }) {
  const { wsId, number } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) return Response.json({ error: "GitHub not connected" }, { status: 400 })
  const detail = await ghPrDetail(ws.githubRepo, Number(number))
  if (!detail) return Response.json({ error: "PR not found on GitHub" }, { status: 404 })
  return Response.json(detail)
}
