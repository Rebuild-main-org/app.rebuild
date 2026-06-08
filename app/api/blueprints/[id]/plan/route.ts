import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { AINotConfiguredError, planFromArchitecture } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { getBlueprint, updateBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/plan — generate the delivery plan preview
// (planFromArchitecture) from the spec + design doc, WITHOUT creating anything.
// Freezes it on the blueprint and sets gates.plan.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })

  const source = [bp.specYaml, bp.designDoc, bp.acceptanceYaml].filter(Boolean).join("\n\n")
  if (source.trim().length < 40) {
    return Response.json({ error: "Spec/design trop courts pour planifier." }, { status: 400 })
  }

  try {
    const plan = await withAi(user, "scaffold", () => planFromArchitecture(source))
    const ok = (plan.projects?.length ?? 0) > 0
    await updateBlueprint(id, { plan, gates: { ...bp.gates, plan: ok } })
    return Response.json({ plan })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: e instanceof Error ? e.message : "Planning failed" }, { status: 502 })
  }
}
