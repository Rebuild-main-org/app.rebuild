import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import { adminConfigured, supabaseAdmin } from "@/lib/supabase/admin"
import { ALL_ROLES, type Role } from "@/lib/types"

const ROLES: Role[] = ALL_ROLES

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (!isAdmin(user.role)) return { error: "Forbidden", status: 403 as const }
  if (!adminConfigured())
    return { error: "Supabase admin not configured", status: 503 as const }
  return { user }
}

// PATCH /api/admin/users/:id — change a user's role.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin()
  if ("error" in guard)
    return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  const { role } = (await request.json()) as { role?: Role }
  if (!ROLES.includes(role as Role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 })
  }
  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ role })
    .eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  // Fix D: mirror into the `users` directory so badges/analytics/roster don't
  // drift until the user's next login.
  await supabaseAdmin().from("users").update({ role }).eq("id", id)
  return Response.json({ ok: true })
}

// DELETE /api/admin/users/:id — GDPR-friendly removal: anonymize the directory
// row (scrub PII, keep foreign keys so history/audit stay consistent) then
// delete the auth user (disables login + cascades the profile).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin()
  if ("error" in guard)
    return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  if (guard.user.id === id) {
    return Response.json({ error: "You cannot delete yourself" }, { status: 400 })
  }
  // Anonymize first (email is unique+not-null, so use a non-routable placeholder).
  await supabaseAdmin()
    .from("users")
    .update({
      name: "Deleted user",
      email: `deleted+${id}@removed.invalid`,
      avatar_url: null,
    })
    .eq("id", id)
  const { error } = await supabaseAdmin().auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
