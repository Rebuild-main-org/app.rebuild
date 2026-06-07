import { getSessionUser } from "@/lib/auth/session"
import { getPreferences, savePreferences, sb } from "@/lib/data"
import { createClient } from "@/lib/supabase/server"
import type { UserPreferences } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/profile — current user + preferences.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json({ user, preferences: await getPreferences(user.id) })
}

// PATCH /api/profile — update display name and/or preferences.
export async function PATCH(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json()) as {
    name?: string
    avatarUrl?: string | null
    githubUsername?: string | null
    preferences?: Partial<UserPreferences>
  }
  let name = user.name
  let avatarUrl = user.avatarUrl
  const supabase = await createClient()
  if (body.name?.trim()) {
    name = body.name.trim()
    await supabase.from("profiles").update({ name }).eq("id", user.id)
    await sb().from("users").update({ name }).eq("id", user.id)
  }
  if (body.githubUsername !== undefined) {
    // Normalise to a bare login (strip "@" or a profile URL); empty unsets it.
    const login =
      (body.githubUsername ?? "")
        .trim()
        .replace(/^@/, "")
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/\/.*$/, "") || null
    await sb().from("users").update({ github_id: login }).eq("id", user.id)
  }
  if (body.avatarUrl !== undefined) {
    avatarUrl = body.avatarUrl ?? undefined
    await supabase.from("profiles").update({ avatar_url: body.avatarUrl }).eq("id", user.id)
    await sb().from("users").update({ avatar_url: body.avatarUrl }).eq("id", user.id)
  }
  const preferences = body.preferences
    ? await savePreferences(user.id, body.preferences)
    : await getPreferences(user.id)
  return Response.json({ user: { ...user, name, avatarUrl }, preferences })
}
