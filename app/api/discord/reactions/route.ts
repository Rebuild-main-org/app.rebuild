import { randomUUID } from "crypto"

import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"
import { emit } from "@/lib/events"

export const dynamic = "force-dynamic"

// POST /api/discord/reactions { messageId, emoji } — toggle a reaction on a DM.
export async function POST(request: Request) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { messageId, emoji } = (await request.json()) as { messageId?: string; emoji?: string }
  if (!messageId || !emoji) return Response.json({ error: "messageId and emoji required" }, { status: 400 })

  // The caller must be a participant of the message's thread.
  const { data: msg } = await sb().from("dm_messages").select("thread_id").eq("id", messageId).maybeSingle()
  if (!msg) return Response.json({ error: "Not found" }, { status: 404 })
  const threadId = msg.thread_id as string
  const { data: part } = await sb()
    .from("dm_participants")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", me.id)
    .maybeSingle()
  if (!part) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { data: existing } = await sb()
    .from("dm_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", me.id)
    .eq("emoji", emoji)
    .maybeSingle()

  let added: boolean
  if (existing?.id) {
    await sb().from("dm_reactions").delete().eq("id", existing.id)
    added = false
  } else {
    await sb().from("dm_reactions").insert({
      id: randomUUID(),
      message_id: messageId,
      user_id: me.id,
      emoji,
      created_at: new Date().toISOString(),
    })
    added = true
  }
  // Tell the other participant's open view (delta, not from me on their side).
  emit([`dm:${threadId}`], "dm.reaction", { messageId, emoji, delta: added ? 1 : -1 }, me.id)
  return Response.json({ ok: true, added })
}
