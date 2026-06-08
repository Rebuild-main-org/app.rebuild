import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { createBlueprint, listBlueprints } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// GET /api/blueprints — list all blueprints (Phase A — Conception).
export async function GET() {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  return Response.json(await listBlueprints())
}

// POST /api/blueprints { title, specYaml? } — start a new blueprint (Intake).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { title, specYaml } = (await request.json().catch(() => ({}))) as {
    title?: string
    specYaml?: string
  }
  if (!title?.trim()) return Response.json({ error: "title is required" }, { status: 400 })
  const bp = await createBlueprint({ title: title.trim(), specYaml, createdBy: user.id })
  return Response.json(bp, { status: 201 })
}
