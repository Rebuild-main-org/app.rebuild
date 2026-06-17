import { NextResponse } from "next/server"
import { randomUUID } from "crypto"

import { requireAuth } from "@/lib/auth/guard"
import { githubOauthEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/github/connect — start the GitHub OAuth flow so the signed-in user
// can link their GitHub account. The callback then invites them to the org.
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const origin = new URL(request.url).origin
  if (!githubOauthEnabled()) {
    return NextResponse.redirect(new URL("/profile?github=disabled", origin))
  }
  const state = randomUUID()
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID as string,
    redirect_uri: `${origin}/api/github/callback`,
    scope: "read:user",
    state,
    allow_signup: "false",
  })
  const res = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
  // CSRF: GitHub echoes `state`; the callback checks it against this httpOnly cookie.
  res.cookies.set("gh_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // survives the top-level redirect back from GitHub
    path: "/",
    maxAge: 600,
  })
  return res
}
