import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghWorkflowRuns, ghRerunWorkflow, ghCancelWorkflow, githubEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/git/:wsId/actions — recent GitHub Actions workflow runs.
export async function GET(_request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) return Response.json([])
  return Response.json(await ghWorkflowRuns(ws.githubRepo))
}

// POST /api/git/:wsId/actions { runId, op: "rerun" | "rerun-failed" | "cancel" }
export async function POST(request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const ws = await getWorkspace(wsId)
  if (!ws?.githubRepo || !githubEnabled()) {
    return Response.json({ error: "GitHub not connected" }, { status: 400 })
  }
  const { runId, op } = (await request.json()) as { runId?: number; op?: string }
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 })

  const res =
    op === "cancel"
      ? await ghCancelWorkflow(ws.githubRepo, runId)
      : await ghRerunWorkflow(ws.githubRepo, runId, op === "rerun-failed")
  if (!res.ok) return Response.json({ error: res.error }, { status: 502 })
  return Response.json({ ok: true })
}
