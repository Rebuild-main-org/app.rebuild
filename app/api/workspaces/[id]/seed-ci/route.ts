import { requireWorkspace } from "@/lib/auth/guard"
import { getWorkspace } from "@/lib/queries"
import { defaultOrg, githubEnabled, seedDefaultCI } from "@/lib/github"

export const dynamic = "force-dynamic"

// POST /api/workspaces/:id/seed-ci — write (or reset to) the default CI workflow
// (install → typecheck → test → build) into the workspace's repo. Admin/lead.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireWorkspace(id, "workspace.edit")
  if (access instanceof Response) return access

  if (!githubEnabled()) {
    return Response.json({ error: "GitHub is not configured on the server." }, { status: 503 })
  }
  const ws = await getWorkspace(id)
  if (!ws?.githubRepo) {
    return Response.json({ error: "This workspace has no GitHub repo set." }, { status: 400 })
  }
  const repo = ws.githubRepo.includes("/") ? ws.githubRepo : `${defaultOrg()}/${ws.githubRepo}`

  const result = await seedDefaultCI(repo)
  if (!result.ok) {
    // Most likely the server token lacks the `workflow` scope.
    return Response.json(
      { error: `Could not write the CI workflow to ${repo}: ${result.error}` },
      { status: 502 }
    )
  }
  return Response.json({ ok: true, repo })
}
