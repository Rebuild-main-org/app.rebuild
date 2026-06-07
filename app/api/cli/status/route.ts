import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

// A CLI is considered "connected" if it made an authenticated call recently.
const ACTIVE_MS = 5 * 60_000

// GET /api/cli/status — is a rebuild216 CLI connected to the current account now?
export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await sb()
    .from("cli_sessions")
    .select("last_seen_at,last_project")
    .eq("user_id", user.id)
    .maybeSingle()
  const lastSeenAt = (data?.last_seen_at as string) ?? null
  const connected = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() < ACTIVE_MS : false
  return Response.json({ connected, lastSeenAt, lastProject: (data?.last_project as string) ?? null })
}
