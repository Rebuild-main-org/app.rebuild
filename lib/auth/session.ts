// Real authentication surface, backed by Supabase Auth.
//
// getSessionUser() reads the signed-in user from the auth cookies and their
// role from the `profiles` table (RLS-protected, own row). This is the single
// source of truth for "who is making this request".

import "server-only"
import type { Role, User } from "@/lib/types"
import { createClient, supabaseConfigured } from "@/lib/supabase/server"
import { adminConfigured } from "@/lib/supabase/admin"
import { syncUserDirectory } from "@/lib/data"

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
  githubUsername?: string // GitHub login, when signed in via GitHub OAuth
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!supabaseConfigured()) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, avatar_url")
    .eq("id", user.id)
    .single()

  const email = user.email ?? ""
  // GitHub OAuth populates user_metadata.user_name with the GitHub login.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const githubUsername =
    typeof meta.user_name === "string" && meta.user_name ? meta.user_name : undefined
  let role = (profile?.role as Role) ?? "ENGINEER"
  const list = (v?: string) =>
    (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  // Bootstrap admins (BOOTSTRAP_ADMINS, comma-separated) are elevated to ADMIN
  // ONLY while their stored role is still the default ENGINEER. Once an admin
  // explicitly assigns them another role, that assignment wins (no re-elevation).
  if (email && role === "ENGINEER" && list(process.env.BOOTSTRAP_ADMINS).includes(email.toLowerCase()))
    role = "ADMIN"
  // Super-admins: BOOTSTRAP_SUPER_ADMINS plus the built-in admin@rebuild.tn.
  const superAdmins = [...list(process.env.BOOTSTRAP_SUPER_ADMINS), "admin@rebuild.tn"]
  if (email && superAdmins.includes(email.toLowerCase())) role = "SUPER_ADMIN"

  return {
    id: user.id,
    email,
    name: profile?.name || user.email?.split("@")[0] || "User",
    role,
    avatarUrl: profile?.avatar_url ?? undefined,
    githubUsername,
  }
}

// Resolves the session into an app `User` and mirrors it into the `users`
// directory (so data this person creates resolves to a name). Returns the User.
export async function resolveAppUser(session: SessionUser): Promise<User> {
  const user: User = {
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
    avatarUrl: session.avatarUrl,
  }
  if (adminConfigured()) {
    try {
      await syncUserDirectory(session)
    } catch {
      // directory sync is best-effort
    }
  }
  return user
}
