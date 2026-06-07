import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import { getWorkspace } from "@/lib/queries"
import type { Workspace } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"
import { ensureRepo, ghDeleteRepo, githubEnabled, type EnsureRepoResult } from "@/lib/github"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const workspace = await getWorkspace(id)
  if (!workspace) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(workspace)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "workspace.edit")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const patch = (await request.json()) as Partial<Workspace>
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.githubRepo !== undefined) row.github_repo = patch.githubRepo
  if (patch.status !== undefined) row.status = patch.status
  if (patch.clientName !== undefined) row.client_name = patch.clientName
  if (patch.clientEmail !== undefined) row.client_email = patch.clientEmail
  if (patch.technologies !== undefined) row.technologies = patch.technologies

  const { data, error } = await sb()
    .from("workspaces")
    .update(row)
    .eq("id", id)
    .select(SEL.workspace)
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })

  // Auto-provision the GitHub repo if a new one was set and a token is present.
  let repo: EnsureRepoResult | undefined
  let row2 = data as Record<string, unknown>
  if (patch.githubRepo !== undefined && githubEnabled()) {
    try {
      repo = await ensureRepo(patch.githubRepo)
      // If the repo was created under a different owner (e.g. the org wasn't
      // accessible so it landed on the user account), persist the real name.
      if (repo.fullName && repo.fullName !== patch.githubRepo) {
        const { data: updated } = await sb()
          .from("workspaces")
          .update({ github_repo: repo.fullName })
          .eq("id", id)
          .select(SEL.workspace)
          .maybeSingle()
        if (updated) row2 = updated as Record<string, unknown>
      }
    } catch (e) {
      repo = { existed: false, created: false, error: e instanceof Error ? e.message : "Repo check failed" }
    }
  }
  return Response.json({ ...row2, repo })
}

// DELETE /api/workspaces/:id?deleteRepo=1 — ADMIN only. Cascades to projects,
// tickets, git, documents, etc. via ON DELETE CASCADE. When deleteRepo is set
// and GitHub is connected, the associated repo is permanently deleted too.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireWorkspace(id, "workspace.delete")
  if (access instanceof Response) return access

  const deleteRepo = new URL(request.url).searchParams.get("deleteRepo") === "1"
  const ws = await getWorkspace(id)

  // Delete the GitHub repo first (best-effort) — reported back in the response.
  let repo: { deleted: boolean; error?: string } | undefined
  if (deleteRepo && ws?.githubRepo && ws.githubRepo.includes("/") && githubEnabled()) {
    repo = await ghDeleteRepo(ws.githubRepo)
  }

  const { error } = await sb().from("workspaces").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true, repo })
}
