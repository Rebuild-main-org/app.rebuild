import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { AINotConfiguredError, critiqueSpec } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { CRITIQUE_PASS_SCORE, getBlueprint, updateBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/critique — run the adversarial spec critique
// (critiqueSpec) with the human's accumulated answers. Stores the result and
// sets gates.critique = (readiness === "READY").
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  if (bp.specYaml.trim().length < 40) {
    return Response.json({ error: "La spec est trop courte pour être auditée." }, { status: 400 })
  }

  try {
    const result = await withAi(user, "spec-critique", () =>
      critiqueSpec({ spec: bp.specYaml, answers: bp.answers })
    )
    // Gate passes from the score threshold (e.g. ≥ 55%), not strict READY.
    const pass = (result.spec_quality_score ?? 0) >= CRITIQUE_PASS_SCORE
    const updated = await updateBlueprint(id, {
      critique: result,
      gates: { ...bp.gates, critique: pass },
    })
    return Response.json({ ...result, pass, blueprint: updated })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: e instanceof Error ? e.message : "Critique failed" }, { status: 502 })
  }
}
