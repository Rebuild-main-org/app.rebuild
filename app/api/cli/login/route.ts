import { createClient } from "@supabase/supabase-js"
import { mintCliToken } from "@/lib/cli-auth"

export const dynamic = "force-dynamic"

// POST /api/cli/login { email, password } → access/refresh token for the CLI.
// Public (no cookie session); the server performs the password sign-in.
export async function POST(request: Request) {
  const { email, password } = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }
  if (!email || !password) {
    return Response.json({ error: "email and password required" }, { status: 400 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return Response.json({ error: "Auth not configured" }, { status: 503 })

  const sb = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    return Response.json({ error: error?.message ?? "Invalid credentials" }, { status: 401 })
  }

  // Mint a non-expiring CLI token so long agent runs never get logged out. The
  // JWT/refresh pair is still returned for backward compatibility.
  let cliToken: string | undefined
  if (data.user?.id) {
    try {
      cliToken = await mintCliToken(data.user.id, {
        email: data.user.email ?? undefined,
        name: (data.user.user_metadata?.name as string) ?? undefined,
      })
    } catch {
      /* fall back to the JWT path */
    }
  }

  return Response.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    cliToken,
    user: { id: data.user?.id, email: data.user?.email },
  })
}
