import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghMoveFile, githubEnabled } from "@/lib/github"

// POST /api/git/:wsId/move — move/rename a file (drag-drop into a folder).
// Body: { from, to }. GitHub-backed only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const { from, to, message, branch } = (await request.json()) as {
    from?: string
    to?: string
    message?: string
    branch?: string
  }
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 })
  if (from === to) return Response.json({ ok: true })
  if (!githubEnabled()) {
    return Response.json({ error: "Move requires a connected GitHub repo" }, { status: 400 })
  }
  const ws = await getWorkspace(wsId)
  if (!ws) return Response.json({ error: "Not found" }, { status: 404 })
  try {
    await ghMoveFile(ws.githubRepo, from, to, message?.trim() || `Move ${from} → ${to}`, branch || "main")
    return Response.json({ ok: true, from, to })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Move failed" }, { status: 502 })
  }
}
