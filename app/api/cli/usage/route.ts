import { randomUUID } from "crypto"

import { userFromBearer } from "@/lib/cli-auth"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

// POST /api/cli/usage (Bearer) — record a rebuild216 run's AI cost so CLI usage
// shows in the AI governance dashboard alongside server-side calls.
export async function POST(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const b = (await request.json().catch(() => ({}))) as {
    feature?: string
    model?: string
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    workspaceId?: string
    projectId?: string
  }
  try {
    await sb().from("ai_usage").insert({
      id: randomUUID(),
      user_id: user.id,
      workspace_id: b.workspaceId || null,
      project_id: b.projectId || null,
      feature: b.feature || "cli",
      model: b.model || "claude-code",
      input_tokens: Math.max(0, Math.round(b.inputTokens ?? 0)),
      output_tokens: Math.max(0, Math.round(b.outputTokens ?? 0)),
      cost_usd: Number(b.costUsd ?? 0),
      created_at: new Date().toISOString(),
    })
  } catch {
    /* best-effort */
  }
  return Response.json({ ok: true })
}
