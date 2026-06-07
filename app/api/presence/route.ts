import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

// POST /api/presence — heartbeat. Stamps the caller's last_seen_at so others
// can see who's online now (used by the Discord directory).
export async function POST() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  await sb().from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id)
  return Response.json({ ok: true })
}
