import { requireAuth } from "@/lib/auth/guard"
import { sb } from "@/lib/data"
import { defaultOrg, ghRequestContribution, ghIsOrgMember, githubOauthEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

async function linkedLogin(userId: string): Promise<string | null> {
  const { data } = await sb().from("users").select("github_id").eq("id", userId).maybeSingle()
  return (data?.github_id as string) || null
}

// GET /api/profile/github — connection status for the current user.
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const login = await linkedLogin(auth.id)
  const orgMember = login ? await ghIsOrgMember(login) : false
  return Response.json({
    connected: !!login,
    login,
    orgMember,
    org: defaultOrg(),
    oauthEnabled: githubOauthEnabled(),
  })
}

// POST /api/profile/github — (re)request access to the org for the linked account.
export async function POST() {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const login = await linkedLogin(auth.id)
  if (!login) return Response.json({ error: "No linked GitHub account" }, { status: 400 })
  const invite = await ghRequestContribution(login)
  if (!invite.ok) return Response.json({ error: invite.error ?? "Invite failed" }, { status: 502 })
  return Response.json({ ok: true, state: invite.state, scope: invite.scope, target: invite.target })
}

// DELETE /api/profile/github — unlink the GitHub account.
export async function DELETE() {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  await sb().from("users").update({ github_id: null }).eq("id", auth.id)
  return Response.json({ ok: true })
}
