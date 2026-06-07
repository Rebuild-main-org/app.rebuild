import { AINotConfiguredError, generateDocs } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { getRepoFile } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { rateLimitResponse } from "@/lib/ratelimit"

// POST /api/ai/docs — generate documentation for a repo file.
export async function POST(request: Request) {
  const { wsId, path } = (await request.json()) as {
    wsId?: string
    path?: string
  }
  if (!wsId || !path) {
    return Response.json({ error: "wsId and path required" }, { status: 400 })
  }
  const auth = await requireWorkspace(wsId, "copilot.use")
  if (auth instanceof Response) return auth
  const rl = rateLimitResponse(`ai:${auth.id}`, 20, 60_000)
  if (rl) return rl
  const file = await getRepoFile(wsId, path)
  if (!file) return Response.json({ error: "Not found" }, { status: 404 })
  try {
    const docs = await withAi(auth, "docs", () => generateDocs({ path: file.path, code: file.content }), { workspaceId: wsId })
    return Response.json({ docs })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) {
      return Response.json({ error: e.message }, { status: 503 })
    }
    return Response.json({ error: "Doc generation failed" }, { status: 502 })
  }
}
