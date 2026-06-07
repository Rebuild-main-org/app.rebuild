// Service-role Supabase client (server only — bypasses RLS). Used by the data
// layer once the migration lands. Never import this into client code.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export function adminConfigured(): boolean {
  return !!(URL && SERVICE)
}

let admin: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  if (!URL || !SERVICE) {
    throw new Error(
      "Supabase admin not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }
  if (!admin) {
    admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return admin
}
