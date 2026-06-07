import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

// GET /api/profile/anthropic — connection status (never returns the key).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await sb()
    .from("user_ai_keys")
    .select("anthropic_key")
    .eq("user_id", user.id)
    .maybeSingle()
  const key = (data?.anthropic_key as string) ?? ""
  return Response.json({
    connected: !!key,
    hint: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null,
  })
}

// PUT /api/profile/anthropic { key } — connect the user's Anthropic account.
export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { key } = (await request.json().catch(() => ({}))) as { key?: string }
  const k = (key ?? "").trim()
  if (!/^sk-ant-/.test(k)) {
    return Response.json({ error: "Clé Anthropic invalide (attendu : sk-ant-…)." }, { status: 400 })
  }
  const now = new Date().toISOString()
  const { error } = await sb()
    .from("user_ai_keys")
    .upsert({ user_id: user.id, anthropic_key: k, updated_at: now }, { onConflict: "user_id" })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ connected: true, hint: `${k.slice(0, 7)}…${k.slice(-4)}` })
}

// DELETE /api/profile/anthropic — disconnect.
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  await sb().from("user_ai_keys").delete().eq("user_id", user.id)
  return Response.json({ connected: false })
}
