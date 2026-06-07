import { AccessToken } from "livekit-server-sdk"

import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"
import { createNotification } from "@/lib/mutations"
import { emit } from "@/lib/events"

export const dynamic = "force-dynamic"

// POST /api/discord/call-token { threadId, ring? } — mint a LiveKit token to join
// the call room for a thread. `ring: true` (the caller) notifies the others.
export async function POST(request: Request) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const url = process.env.LIVEKIT_URL
  const key = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  if (!url || !key || !secret) {
    return Response.json({ error: "Video calls are not configured (set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET)." }, { status: 503 })
  }

  const { threadId, ring } = (await request.json()) as { threadId?: string; ring?: boolean }
  if (!threadId) return Response.json({ error: "threadId required" }, { status: 400 })

  // Must be a participant of the thread (or SUPER_ADMIN).
  const { data: parts } = await sb().from("dm_participants").select("user_id").eq("thread_id", threadId)
  const members = (parts ?? []).map((p) => p.user_id as string)
  if (!members.includes(me.id) && me.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const room = `call-${threadId}`
  const at = new AccessToken(key, secret, { identity: me.id, name: me.name, ttl: "2h" })
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true })
  const token = await at.toJwt()

  // Ring the other participants (realtime toast + notification).
  if (ring) {
    const { data: thread } = await sb().from("dm_threads").select("is_group,name").eq("id", threadId).maybeSingle()
    const title = thread?.is_group ? (thread.name as string) || "Group" : me.name
    const others = members.filter((id) => id !== me.id)
    if (others.length) {
      emit(others.map((id) => `user:${id}`), "call.ring", { threadId, room, title, from: me.name }, me.id)
      for (const uid of others) {
        await createNotification(uid, "call", `📞 ${me.name} is calling${thread?.is_group ? ` in ${title}` : ""}`, `/discord?thread=${threadId}&call=1`)
      }
    }
  }

  return Response.json({ token, url, room })
}
