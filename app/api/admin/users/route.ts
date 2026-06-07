import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import { adminConfigured, supabaseAdmin } from "@/lib/supabase/admin"
import { ALL_ROLES, type Role } from "@/lib/types"

export const dynamic = "force-dynamic"

const ROLES: Role[] = ALL_ROLES

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (!isAdmin(user.role)) return { error: "Forbidden", status: 403 as const }
  if (!adminConfigured())
    return {
      error: "Supabase admin not configured — set SUPABASE_SERVICE_ROLE_KEY",
      status: 503 as const,
    }
  return { user }
}

// GET /api/admin/users — list all profiles (real Supabase).
export async function GET() {
  const guard = await requireAdmin()
  if ("error" in guard)
    return Response.json({ error: guard.error }, { status: guard.status })

  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("id, email, name, role, created_at")
    .order("created_at", { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}

// POST /api/admin/users — create a confirmed user with a role.
export async function POST(request: Request) {
  const guard = await requireAdmin()
  if ("error" in guard)
    return Response.json({ error: guard.error }, { status: guard.status })

  const body = (await request.json()) as {
    email?: string
    name?: string
    role?: Role
    password?: string
  }
  const email = body.email?.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    return Response.json({ error: "A valid email is required" }, { status: 400 })
  }
  const role: Role = ROLES.includes(body.role as Role)
    ? (body.role as Role)
    : "ENGINEER"
  // Temporary password if none supplied; the user resets via magic link.
  const password =
    body.password && body.password.length >= 8
      ? body.password
      : crypto.randomUUID()

  const sb = supabaseAdmin()
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: body.name?.trim() || email.split("@")[0] },
  })
  if (error || !data.user) {
    return Response.json(
      { error: error?.message ?? "Could not create user" },
      { status: 400 }
    )
  }

  // The signup trigger created a profile; set the requested role/name.
  const { error: pErr } = await sb
    .from("profiles")
    .update({ role, name: body.name?.trim() || email.split("@")[0] })
    .eq("id", data.user.id)
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 })

  return Response.json(
    { id: data.user.id, email, role, tempPassword: body.password ? undefined : password },
    { status: 201 }
  )
}
