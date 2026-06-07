import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { can } from "@/lib/auth"
import { getSessionUser } from "@/lib/auth/session"
import { ghReleases, ghCreateRelease, githubEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/git/:wsId/releases — GitHub releases for the workspace repo.
export async function GET(_request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) return Response.json([])
  return Response.json(await ghReleases(ws.githubRepo))
}

// POST /api/git/:wsId/releases { tag, name, body } — create a GitHub release.
// pr.merge (lead/admin) only.
export async function POST(request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const user = await getSessionUser()
  if (!user || !can(user, "pr.merge")) {
    return Response.json({ error: "Only leads and admins can publish releases" }, { status: 403 })
  }
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) return Response.json({ error: "GitHub not connected" }, { status: 400 })
  const { tag, name, body } = (await request.json()) as { tag?: string; name?: string; body?: string }
  if (!tag?.trim()) return Response.json({ error: "tag required" }, { status: 400 })
  const res = await ghCreateRelease(ws.githubRepo, tag.trim(), name?.trim() ?? tag.trim(), body ?? "")
  if (!res.ok) return Response.json({ error: res.error }, { status: 502 })
  return Response.json({ ok: true, url: res.url }, { status: 201 })
}
