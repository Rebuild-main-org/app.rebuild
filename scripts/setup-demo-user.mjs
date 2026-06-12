// Create (idempotently) a high-privilege demo user on the TARGET Supabase, and
// link it to the seeded workspaces so it sees the demo data. Run AFTER applying
// supabase/all.sql + supabase/seed.sql.
//
//   node scripts/setup-demo-user.mjs
//
// Env (from .env.local or shell):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
//   TEST_EMAIL     demo-admin@rebuild.local
//   TEST_PASSWORD  (required)
//
// Uses the service-role key (bypasses RLS). Safe to re-run.

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

// Load .env.local into process.env (only keys not already set).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
} catch {
  /* no .env.local — rely on shell env */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_EMAIL || "demo-admin@rebuild.local"
const PASSWORD = process.env.TEST_PASSWORD
const NAME = "Demo Admin"
const WS_IDS = (process.env.WS_IDS || "ws_acme,ws_nova").split(",").map((s) => s.trim()).filter(Boolean)

if (!URL || !KEY || !PASSWORD) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or TEST_PASSWORD.")
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// 1) Create the auth user (or find + reset password if it already exists).
let uid
{
  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: NAME },
  })
  if (error) {
    // Likely already registered — find it and reset the password.
    let page = 1
    for (;;) {
      const { data: list, error: le } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      if (le) throw le
      const found = list.users.find((u) => (u.email || "").toLowerCase() === EMAIL.toLowerCase())
      if (found) {
        uid = found.id
        await sb.auth.admin.updateUserById(uid, { password: PASSWORD, email_confirm: true })
        break
      }
      if (list.users.length < 200) break
      page++
    }
    if (!uid) throw error
    console.log("• existing auth user reused:", uid)
  } else {
    uid = data.user.id
    console.log("• auth user created:", uid)
  }
}

// 2) Mirror into the domain `users` table (workspace_members FK targets it).
{
  const { error } = await sb
    .from("users")
    .upsert({ id: uid, email: EMAIL, name: NAME, role: "ADMIN" }, { onConflict: "id" })
  if (error) throw error
}

// 3) Elevate the profile so every section is visible.
{
  const { error } = await sb.from("profiles").update({ role: "SUPER_ADMIN", name: NAME }).eq("id", uid)
  if (error) throw error
}

// 4) Make it a member of the seeded workspaces so the data is visible.
for (const ws of WS_IDS) {
  const { error } = await sb
    .from("workspace_members")
    .upsert(
      { id: `m_demo_${ws}`, user_id: uid, workspace_id: ws, role: "ADMIN", joined_at: new Date().toISOString() },
      { onConflict: "id" }
    )
  if (error) throw error
}

console.log(`✓ demo user ready: ${EMAIL} (uid ${uid}) — SUPER_ADMIN, member of ${WS_IDS.join(", ")}`)
