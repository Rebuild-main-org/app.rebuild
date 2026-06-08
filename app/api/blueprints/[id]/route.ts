import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { deleteBlueprint, getBlueprint, prereqsGate, updateBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

async function guard() {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) return null
  return user
}

// GET /api/blueprints/:id
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const bp = await getBlueprint((await params).id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(bp)
}

// PATCH /api/blueprints/:id — edit artifacts (spec, answers, design, etc.).
// Editing the spec or its answers invalidates the validate/critique gates.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  if (bp.status === "CONVERTED") {
    return Response.json({ error: "Blueprint déjà converti — lecture seule." }, { status: 409 })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const gates = { ...bp.gates }

  if (typeof body.title === "string") patch.title = body.title
  if (typeof body.specYaml === "string") {
    patch.spec_yaml = body.specYaml
    gates.validate = false // re-validate after a spec edit
    gates.critique = false
  }
  if (typeof body.answers === "string") patch.answers = body.answers
  if (typeof body.feasibility === "string") patch.feasibility = body.feasibility
  if (typeof body.designDoc === "string") patch.design_doc = body.designDoc
  if (typeof body.acceptanceYaml === "string") patch.acceptance_yaml = body.acceptanceYaml
  if (typeof body.figmaUrl === "string") patch.figma_url = body.figmaUrl
  if (body.prereqs && typeof body.prereqs === "object") {
    const prereqs = body.prereqs as Record<string, boolean>
    patch.prereqs = prereqs
    gates.prereqs = prereqsGate(prereqs)
  }
  patch.gates = gates

  const updated = await updateBlueprint(id, patch)
  return Response.json(updated)
}

// DELETE /api/blueprints/:id
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  await deleteBlueprint((await params).id)
  return Response.json({ ok: true })
}
