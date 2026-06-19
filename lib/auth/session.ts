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
  // Role comes solely from the profiles table now. The old env-based elevation
  // (BOOTSTRAP_ADMINS / BOOTSTRAP_SUPER_ADMINS / hardcoded admin@rebuild.tn) was
  // REMOVED — it is unsafe under public self-serve signup (anyone matching those
  // env emails would self-elevate to platform super-admin). Platform-admin is now
  // a separate concept (lib/platform.ts `platform_admins` table), and the ORG
  // role lives in organization_members (lib/tenant.ts).
  const role = (profile?.role as Role) ?? "ENGINEER"

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
