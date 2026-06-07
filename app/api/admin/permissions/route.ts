import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"
import { permissionMatrix, SECTION_KEYS, type SectionKey } from "@/lib/permissions"
import { ALL_ROLES, type Role } from "@/lib/types"

export const dynamic = "force-dynamic"

// Only the SUPER_ADMIN may view/edit the permissions matrix.
async function requireSuper() {
  const user = await getSessionUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (user.role !== "SUPER_ADMIN") return { error: "Forbidden", status: 403 as const }
  return { user }
}

// GET /api/admin/permissions → { matrix } (section → role → allowed).
export async function GET() {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  return Response.json({ matrix: await permissionMatrix() })
}

// PUT /api/admin/permissions { section, role, allowed } → upsert one cell.
export async function PUT(request: Request) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { section, role, allowed } = (await request.json()) as {
    section?: SectionKey
    role?: Role
    allowed?: boolean
  }
  if (!section || !SECTION_KEYS.includes(section)) {
    return Response.json({ error: "invalid section" }, { status: 400 })
  }
  if (!role || !ALL_ROLES.includes(role) || role === "SUPER_ADMIN") {
    return Response.json({ error: "invalid role" }, { status: 400 })
  }
  const { error } = await sb()
    .from("section_permissions")
    .upsert(
      { section, role, allowed: !!allowed, updated_at: new Date().toISOString() },
      { onConflict: "section,role" }
    )
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
