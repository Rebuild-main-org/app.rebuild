// Bearer-token auth for the rebuild216 CLI. Two token kinds are accepted:
//
//  1. Long-lived CLI tokens (prefix `rbld_`) — minted by /api/cli/login and
//     /api/cli/token, stored hashed in `cli_tokens`, and resolved directly to a
//     user. They DO NOT expire, so long agent runs (e.g. a 117-ticket delivery)
//     never get logged out mid-run.
//  2. Supabase access tokens (JWT) — the legacy path; short-lived (~1h) with a
//     refresh-on-401 fallback. Still accepted for backward compatibility.

import "server-only"
import crypto from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { Role } from "@/lib/types"

export interface CliUser {
  id: string
  email: string
  name: string
  role: Role
}

const CLI_TOKEN_PREFIX = "rbld_"

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function isCliToken(token: string): boolean {
  return token.startsWith(CLI_TOKEN_PREFIX)
}

// Mint a fresh non-expiring CLI token for a user and persist its hash. Returns
// the secret once (never stored or retrievable again). Best-effort ensures a
// `users` directory row exists so the token resolves even for CLI-only users.
export async function mintCliToken(
  userId: string,
  opts: { email?: string; name?: string; role?: Role; label?: string } = {}
): Promise<string> {
  const secret = CLI_TOKEN_PREFIX + crypto.randomBytes(30).toString("base64url")
  if (opts.email) {
    // Insert-only (ignoreDuplicates) so we never clobber an existing user's real
    // name/role — this just guarantees a directory row exists to resolve against.
    await supabaseAdmin()
      .from("users")
      .upsert(
        { id: userId, email: opts.email, name: opts.name ?? opts.email, role: opts.role ?? "ENGINEER" },
        { onConflict: "id", ignoreDuplicates: true }
      )
      .then(() => {}, () => {}) // best-effort
  }
  await supabaseAdmin().from("cli_tokens").insert({
    id: secret.slice(0, 12), // non-secret prefix for display/identification
    token_hash: hashToken(secret),
    user_id: userId,
    label: opts.label ?? "rebuild216",
  })
  return secret
}

// Revoke every CLI token for a user (e.g. on logout / rotate).
export async function revokeCliTokens(userId: string): Promise<void> {
  await supabaseAdmin().from("cli_tokens").delete().eq("user_id", userId)
}

// Apply the same bootstrap role elevation the cookie session uses, then return.
function elevate(email: string, role: Role): Role {
  const list = (v?: string) =>
    (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  let r = role
  if (email && r === "ENGINEER" && list(process.env.BOOTSTRAP_ADMINS).includes(email.toLowerCase()))
    r = "ADMIN"
  const superAdmins = [...list(process.env.BOOTSTRAP_SUPER_ADMINS), "admin@rebuild.tn"]
  if (email && superAdmins.includes(email.toLowerCase())) r = "SUPER_ADMIN"
  return r
}

// Heartbeat: stamp the CLI's last activity so the app can show "CLI connected".
async function heartbeat(userId: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("cli_sessions")
      .upsert({ user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" })
  } catch {
    /* best-effort */
  }
}

async function userFromCliToken(token: string): Promise<CliUser | null> {
  const admin = supabaseAdmin()
  const { data: row } = await admin
    .from("cli_tokens")
    .select("user_id")
    .eq("token_hash", hashToken(token))
    .maybeSingle()
  if (!row?.user_id) return null
  const userId = row.user_id as string
  const { data: u } = await admin
    .from("users")
    .select("id,email,name,role")
    .eq("id", userId)
    .maybeSingle()
  if (!u) return null
  const email = (u.email as string) ?? ""
  // Touch last_used_at (best-effort) and heartbeat.
  admin
    .from("cli_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .then(() => {}, () => {})
  await heartbeat(userId)
  return {
    id: userId,
    email,
    name: (u.name as string) || email.split("@")[0] || "User",
    role: elevate(email, (u.role as Role) ?? "ENGINEER"),
  }
}

async function userFromJwt(token: string): Promise<CliUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const sb = createClient(url, anon)
  const {
    data: { user },
  } = await sb.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await supabaseAdmin()
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .maybeSingle()
  const email = user.email ?? ""
  await heartbeat(user.id)
  return {
    id: user.id,
    email,
    name: profile?.name || user.email?.split("@")[0] || "User",
    role: elevate(email, (profile?.role as Role) ?? "ENGINEER"),
  }
}

export async function userFromBearer(request: Request): Promise<CliUser | null> {
  const header = request.headers.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) return null
  return isCliToken(token) ? userFromCliToken(token) : userFromJwt(token)
}
