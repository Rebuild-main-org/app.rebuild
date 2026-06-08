import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { canApprove, getBlueprint, pendingGates, updateBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/approve — freeze the Blueprint (status APPROVED) once
// EVERY gate is green. This is the gate that unlocks workspace creation.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  if (bp.status === "CONVERTED") {
    return Response.json({ error: "Déjà converti." }, { status: 409 })
  }
  if (!canApprove(bp)) {
    return Response.json(
      { error: "Gates non satisfaits", pending: pendingGates(bp) },
      { status: 409 }
    )
  }
  const updated = await updateBlueprint(id, { status: "APPROVED" })
  return Response.json(updated)
}
