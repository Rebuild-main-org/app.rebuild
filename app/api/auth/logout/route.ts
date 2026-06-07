import { createClient, supabaseConfigured } from "@/lib/supabase/server"

// POST /api/auth/logout — ends the Supabase session (clears auth cookies).
export async function POST() {
  if (supabaseConfigured()) {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }
  return Response.json({ ok: true })
}
