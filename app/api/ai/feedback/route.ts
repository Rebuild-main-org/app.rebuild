import { requireAuth } from "@/lib/auth/guard"
import { rateLimitResponse } from "@/lib/ratelimit"
import { createAiFeedback } from "@/lib/mutations"
import { scoreTrace } from "@/lib/observability/langfuse"
import { recordFeedback } from "@/lib/observability/metrics"
import type { AiFeedbackScore } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST /api/ai/feedback — rate a traced AI output (thumbs up/down + optional
// note). Writes ai_feedback AND forwards the score to Langfuse (no-op if off).
export async function POST(request: Request) {
  const auth = await requireAuth("ai.feedback.create")
  if (auth instanceof Response) return auth
  const rl = rateLimitResponse(`ai-feedback:${auth.id}`, 30, 60_000)
  if (rl) return rl

  const { traceId, feature, score, note, workspaceId } = (await request.json()) as {
    traceId?: string
    feature?: string
    score?: number
    note?: string
    workspaceId?: string
  }
  if (!traceId) return Response.json({ error: "traceId required" }, { status: 400 })
  if (score !== -1 && score !== 0 && score !== 1) {
    return Response.json({ error: "score must be -1, 0 or 1" }, { status: 400 })
  }
  if (note != null && (typeof note !== "string" || note.length > 2000)) {
    return Response.json({ error: "note too long" }, { status: 400 })
  }

  const feedback = await createAiFeedback({
    traceId,
    userId: auth.id,
    workspaceId: workspaceId || undefined,
    feature: feature || "chat",
    score: score as AiFeedbackScore,
    note,
  })
  // Mirror to Langfuse so the score shows against the trace (best-effort, no-op
  // when observability is disabled) and to Prometheus for the Grafana dashboards.
  scoreTrace(traceId, score, note)
  recordFeedback(feature || "chat", score)
  return Response.json({ ok: true, id: feedback.id }, { status: 201 })
}
