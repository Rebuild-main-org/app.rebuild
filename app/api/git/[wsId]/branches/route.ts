import { branchesForWorkspace, getWorkspace } from "@/lib/queries"
import { createBranch } from "@/lib/mutations"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghCreateBranch, ghDeleteBranch, githubEnabled } from "@/lib/github"

// GET /api/git/:wsId/branches — all branches with ahead/behind.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  return Response.json(await branchesForWorkspace(wsId))
}

// POST /api/git/:wsId/branch — create a branch (often named after a ticket).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId, "code.access")
  if (_access instanceof Response) return _access
  const { name } = (await request.json()) as { name?: string }
  if (!name?.trim()) {
    return Response.json({ error: "name required" }, { status: 400 })
  }
  const existing = await branchesForWorkspace(wsId)
  if (existing.some((b) => b.name === name)) {
    return Response.json({ error: "Branch exists" }, { status: 409 })
  }
  // GitHub-backed: create a real ref off the default branch.
  if (githubEnabled()) {
    const ws = await getWorkspace(wsId)
    if (ws) {
      try {
        await ghCreateBranch(ws.githubRepo, name.trim())
        return Response.json(
          { id: `${wsId}:${name.trim()}`, workspaceId: wsId, name: name.trim(), ahead: 0, behind: 0, protected: false, lastCommitHash: "", lastCommitDate: new Date().toISOString(), lastAuthorId: "" },
          { status: 201 }
        )
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "Branch creation failed" }, { status: 502 })
      }
    }
  }
  return Response.json(await createBranch(wsId, name.trim()), { status: 201 })
}

// DELETE /api/git/:wsId/branches { name } — delete a branch (never main).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const { name } = (await request.json()) as { name?: string }
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 })
  if (name === "main" || name === "master") {
    return Response.json({ error: "Cannot delete the default branch" }, { status: 400 })
  }
  if (githubEnabled()) {
    const ws = await getWorkspace(wsId)
    if (ws) {
      const res = await ghDeleteBranch(ws.githubRepo, name.trim())
      if (!res.ok) return Response.json({ error: res.error }, { status: 502 })
    }
  }
  return Response.json({ ok: true })
}
