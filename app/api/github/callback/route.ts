import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { requireAuth } from "@/lib/auth/guard"
import { sb } from "@/lib/data"
import { githubOauthEnabled, ghInviteToOrg } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/github/callback — GitHub redirects here after the user authorizes.
// Exchanges the code for the user's GitHub login, stores it, and invites them to
// the org so they can contribute. Redirects back to /profile with a status.
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const url = new URL(request.url)

  // Always redirect back to the profile with a status, clearing the state cookie.
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/profile?github=${status}`, url.origin))
    res.cookies.set("gh_oauth_state", "", { path: "/", maxAge: 0 })
    return res
  }

  if (!githubOauthEnabled()) return back("disabled")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieState = (await cookies()).get("gh_oauth_state")?.value
  if (!code || !state || !cookieState || state !== cookieState) return back("error")

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/api/github/callback`,
      }),
    })
    const token = (await tokenRes.json())?.access_token as string | undefined
    if (!token) return back("error")

    const ghUserRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "rebuild-app",
      },
    })
    const login = (await ghUserRes.json())?.login as string | undefined
    if (!login) return back("error")

    // Store the verified GitHub login on the user.
    await sb().from("users").update({ github_id: login }).eq("id", auth.id)

    // Best-effort: invite them to the org so they can contribute.
    const invite = await ghInviteToOrg(login)
    return back(invite.ok ? (invite.state === "active" ? "member" : "invited") : "connected")
  } catch {
    return back("error")
  }
}
