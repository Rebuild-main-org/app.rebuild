import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// POST /api/cli/refresh { refreshToken } → a fresh access/refresh token pair.
// Supabase access tokens are short-lived (~1h); long agent runs outlive them,
// so the CLI and its MCP server exchange the refresh token for a new one when a
// Bearer call comes back 401. Public (no cookie session).
export async function POST(request: Request) {
  const { refreshToken } = (await request.json().catch(() => ({}))) as { refreshToken?: string }
  if (!refreshToken) return Response.json({ error: "refreshToken required" }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return Response.json({ error: "Auth not configured" }, { status: 503 })

  const sb = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) {
    return Response.json({ error: error?.message ?? "Could not refresh session" }, { status: 401 })
  }
  return Response.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  })
}
