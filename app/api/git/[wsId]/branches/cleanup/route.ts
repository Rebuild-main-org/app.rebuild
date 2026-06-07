import { SEL, sb } from "@/lib/data"
import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghDeleteBranch, githubEnabled } from "@/lib/github"
import type { PullRequest } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST /api/git/:wsId/branches/cleanup — delete the source branches of merged
// PRs (housekeeping). Skips main/master.
export async function POST(_request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) {
    return Response.json({ error: "GitHub not connected" }, { status: 400 })
  }
  const { data: prs } = await sb()
    .from("pull_requests")
    .select(SEL.pr)
    .eq("workspace_id", wsId)
    .eq("status", "MERGED")
  const branches = [
    ...new Set(
      ((prs ?? []) as PullRequest[])
        .map((p) => p.branchFrom)
        .filter((b) => b && b !== "main" && b !== "master")
    ),
  ]
  let deleted = 0
  for (const b of branches) {
    const res = await ghDeleteBranch(ws.githubRepo, b)
    if (res.ok) deleted++
  }
  return Response.json({ ok: true, deleted, attempted: branches.length })
}
