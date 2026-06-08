import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { AINotConfiguredError, proposeSpecRevision } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { getBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/propose — the critique proposes a REVISED spec
// (resolving findings + applying answers). Returned, NOT saved — the human edits
// then approves (which replaces the spec via PATCH).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  if (bp.specYaml.trim().length < 40) {
    return Response.json({ error: "Spec trop courte." }, { status: 400 })
  }

  try {
    const revision = await withAi(user, "spec-revision", () =>
      proposeSpecRevision({ spec: bp.specYaml, critique: bp.critique, answers: bp.answers })
    )
    return Response.json({ revision })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: e instanceof Error ? e.message : "Proposal failed" }, { status: 502 })
  }
}
