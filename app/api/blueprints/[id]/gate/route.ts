import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { GATE_KEYS, getBlueprint, updateBlueprint, type GateKey } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/gate { gate, passed } — toggle a human gate
// (feasibility, design, budgets, prereqs). The auto gates (validate, critique,
// plan) are driven by their own endpoints and can't be set here.
const HUMAN_GATES: GateKey[] = ["feasibility", "design", "budgets", "prereqs"]

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const { gate, passed } = (await request.json().catch(() => ({}))) as {
    gate?: GateKey
    passed?: boolean
  }
  if (!gate || !GATE_KEYS.includes(gate) || !HUMAN_GATES.includes(gate)) {
    return Response.json({ error: "Gate non modifiable manuellement" }, { status: 400 })
  }
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })

  const updated = await updateBlueprint(id, { gates: { ...bp.gates, [gate]: !!passed } })
  return Response.json(updated)
}
