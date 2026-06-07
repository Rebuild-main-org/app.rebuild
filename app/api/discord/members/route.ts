import { getSessionUser } from "@/lib/auth/session"
import { discordDirectory } from "@/lib/discord"

export const dynamic = "force-dynamic"

// GET /api/discord/members — the community directory the caller may see
// (respects block + profile visibility).
export async function GET() {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { members } = await discordDirectory(me.id)
  return Response.json(members)
}
