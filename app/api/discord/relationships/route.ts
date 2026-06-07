import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// GET /api/discord/relationships → { blocked: string[], muted: string[] }
// (target user ids I've blocked / muted).
export async function GET() {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await sb().from("user_blocks").select("target_id,kind").eq("blocker_id", me.id)
  return Response.json({
    blocked: (data ?? []).filter((r) => r.kind === "BLOCK").map((r) => r.target_id as string),
    muted: (data ?? []).filter((r) => r.kind === "MUTE").map((r) => r.target_id as string),
  })
}

// POST /api/discord/relationships { targetId, kind: 'BLOCK'|'MUTE', on: boolean }
export async function POST(request: Request) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { targetId, kind, on } = (await request.json()) as {
    targetId?: string
    kind?: "BLOCK" | "MUTE"
    on?: boolean
  }
  if (!targetId || (kind !== "BLOCK" && kind !== "MUTE")) {
    return Response.json({ error: "targetId and valid kind required" }, { status: 400 })
  }
  if (targetId === me.id) return Response.json({ error: "Cannot target yourself" }, { status: 400 })

  if (on) {
    const { error } = await sb()
      .from("user_blocks")
      .upsert(
        { blocker_id: me.id, target_id: targetId, kind, created_at: new Date().toISOString() },
        { onConflict: "blocker_id,target_id,kind" }
      )
    if (error) return Response.json({ error: error.message }, { status: 400 })
  } else {
    await sb()
      .from("user_blocks")
      .delete()
      .eq("blocker_id", me.id)
      .eq("target_id", targetId)
      .eq("kind", kind)
  }
  return Response.json({ ok: true })
}
