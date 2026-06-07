import { sb } from "@/lib/data"
import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { can } from "@/lib/auth"
import { getSessionUser } from "@/lib/auth/session"
import { listDeployments, promoteDeployment, resolveProjectForRepo, vercelConfigured } from "@/lib/vercel"

export const dynamic = "force-dynamic"

// Resolve (and cache) the Vercel project id for a workspace.
async function projectIdFor(wsId: string, githubRepo: string): Promise<string | null> {
  const { data: link } = await sb().from("vercel_links").select("project_id").eq("workspace_id", wsId).maybeSingle()
  if (link?.project_id) return link.project_id as string
  const resolved = await resolveProjectForRepo(githubRepo)
  if (resolved) {
    await sb().from("vercel_links").upsert(
      { workspace_id: wsId, project_id: resolved, updated_at: new Date().toISOString() },
      { onConflict: "workspace_id" }
    )
  }
  return resolved
}

// GET /api/git/:wsId/vercel — recent Vercel deployments for the workspace.
export async function GET(_request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  if (!vercelConfigured()) return Response.json({ configured: false, deployments: [] })
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo) return Response.json({ configured: true, projectId: null, deployments: [] })
  const projectId = await projectIdFor(wsId, ws.githubRepo)
  if (!projectId) return Response.json({ configured: true, projectId: null, deployments: [] })
  try {
    return Response.json({ configured: true, projectId, deployments: await listDeployments(projectId) })
  } catch (e) {
    return Response.json({ configured: true, projectId, deployments: [], error: e instanceof Error ? e.message : "Vercel error" })
  }
}

// POST /api/git/:wsId/vercel { deploymentId } — promote a deployment to
// production (also used for rollback). Requires pr.merge (lead/admin).
export async function POST(request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const user = await getSessionUser()
  if (!user || !can(user, "pr.merge")) {
    return Response.json({ error: "Only leads and admins can promote / rollback" }, { status: 403 })
  }
  if (!vercelConfigured()) return Response.json({ error: "Vercel not configured" }, { status: 400 })
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo) return Response.json({ error: "No repo" }, { status: 400 })
  const { deploymentId } = (await request.json()) as { deploymentId?: string }
  if (!deploymentId) return Response.json({ error: "deploymentId required" }, { status: 400 })
  const projectId = await projectIdFor(wsId, ws.githubRepo)
  if (!projectId) return Response.json({ error: "No linked Vercel project" }, { status: 400 })
  try {
    await promoteDeployment(projectId, deploymentId)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Promote failed" }, { status: 502 })
  }
}
