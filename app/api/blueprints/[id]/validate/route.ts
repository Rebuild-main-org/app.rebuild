import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { getBlueprint, updateBlueprint, validateSpec } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/validate — deterministic schema/completeness gate.
// Sets gates.validate; returns the missing sections.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })

  const validation = validateSpec(bp.specYaml)
  const updated = await updateBlueprint(id, { gates: { ...bp.gates, validate: validation.ok } })
  if (!updated) {
    return Response.json({ error: "La gate n'a pas pu être enregistrée." }, { status: 500 })
  }
  // Return the persisted blueprint so the client reflects DB truth exactly.
  return Response.json({ ...validation, blueprint: updated })
}
