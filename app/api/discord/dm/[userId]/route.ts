import { randomUUID } from "crypto"

import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"
import { createNotification } from "@/lib/mutations"
import { emit } from "@/lib/events"
import type { DirectMessage } from "@/lib/types"

export const dynamic = "force-dynamic"

// Threads are keyed by the sorted pair so (a,b) and (b,a) resolve to one row.
function pair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

async function getOrCreateThread(meId: string, otherId: string, create: boolean) {
  const [a, b] = pair(meId, otherId)
  const { data: existing } = await sb()
    .from("dm_threads")
    .select("id")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle()
  if (existing?.id) return existing.id as string
  if (!create) return null
  const id = randomUUID()
  const now = new Date().toISOString()
  await sb().from("dm_threads").insert({ id, user_a: a, user_b: b, created_at: now, last_message_at: now })
  // Register both participants so the unified threads/unread queries see it.
  await sb().from("dm_participants").upsert(
    [{ thread_id: id, user_id: a }, { thread_id: id, user_id: b }],
    { onConflict: "thread_id,user_id" }
  )
  return id
}

// GET /api/discord/dm/:userId — the conversation with that user (creates nothing).
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { userId } = await params
  if (userId === me.id) return Response.json({ error: "Cannot message yourself" }, { status: 400 })

  const threadId = await getOrCreateThread(me.id, userId, false)
  if (!threadId) return Response.json({ threadId: null, messages: [] })

  const { data: rows } = await sb()
    .from("dm_messages")
    .select(
      "id,threadId:thread_id,senderId:sender_id,content,createdAt:created_at,readAt:read_at,attachmentUrl:attachment_url,attachmentName:attachment_name,attachmentType:attachment_type"
    )
    .eq("thread_id", threadId)
    .order("created_at")
  const messages: DirectMessage[] = (rows ?? []).map((r) => {
    const rec = r as Record<string, unknown>
    return {
      id: rec.id as string,
      threadId: rec.threadId as string,
      senderId: rec.senderId as string,
      content: rec.content as string,
      createdAt: rec.createdAt as string,
      readAt: (rec.readAt as string) ?? null,
      attachment: rec.attachmentUrl
        ? {
            url: rec.attachmentUrl as string,
            name: (rec.attachmentName as string) ?? "file",
            type: (rec.attachmentType as string) ?? "",
          }
        : null,
    }
  })

  // Attach reactions (aggregated per message, with a "mine" flag).
  const ids = messages.map((m) => m.id)
  if (ids.length) {
    const { data: reactions } = await sb()
      .from("dm_reactions")
      .select("message_id,emoji,user_id")
      .in("message_id", ids)
    const byMsg = new Map<string, Map<string, { count: number; mine: boolean }>>()
    for (const r of reactions ?? []) {
      const mid = r.message_id as string
      const emoji = r.emoji as string
      if (!byMsg.has(mid)) byMsg.set(mid, new Map())
      const em = byMsg.get(mid)!
      const cur = em.get(emoji) ?? { count: 0, mine: false }
      cur.count++
      if (r.user_id === me.id) cur.mine = true
      em.set(emoji, cur)
    }
    for (const m of messages) {
      const em = byMsg.get(m.id)
      m.reactions = em ? [...em.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })) : []
    }
  }

  // Mark the other person's messages as read, and tell their open view (✓✓).
  const { data: marked } = await sb()
    .from("dm_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", me.id)
    .is("read_at", null)
    .select("id")
  if (marked && marked.length) emit([`dm:${threadId}`], "dm.read", { by: me.id }, me.id)

  // Advance my per-user read marker (drives the unified unread counts).
  await sb()
    .from("dm_reads")
    .upsert({ thread_id: threadId, user_id: me.id, last_read_at: new Date().toISOString() }, { onConflict: "thread_id,user_id" })

  return Response.json({ threadId, messages })
}

// POST /api/discord/dm/:userId { content } — send a message (creates the thread).
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { userId } = await params
  if (userId === me.id) return Response.json({ error: "Cannot message yourself" }, { status: 400 })
  const { content, attachment } = (await request.json()) as {
    content?: string
    attachment?: { url?: string; name?: string; type?: string } | null
  }
  const hasAttachment = !!attachment?.url
  if (!content?.trim() && !hasAttachment) {
    return Response.json({ error: "content or attachment is required" }, { status: 400 })
  }
  // Attachment size guard (~3MB of base64).
  if (hasAttachment && (attachment!.url as string).length > 4_200_000) {
    return Response.json({ error: "Attachment too large (max ~3MB)" }, { status: 413 })
  }

  // Recipient must exist.
  const { data: recipient } = await sb().from("users").select("id").eq("id", userId).maybeSingle()
  if (!recipient) return Response.json({ error: "User not found" }, { status: 404 })

  // Blocks: neither side may message if either has blocked the other.
  const { data: blocks } = await sb()
    .from("user_blocks")
    .select("blocker_id,target_id")
    .eq("kind", "BLOCK")
    .or(
      `and(blocker_id.eq.${me.id},target_id.eq.${userId}),and(blocker_id.eq.${userId},target_id.eq.${me.id})`
    )
  if (blocks && blocks.length > 0) {
    return Response.json({ error: "You can't message this user." }, { status: 403 })
  }

  const threadId = (await getOrCreateThread(me.id, userId, true))!
  const now = new Date().toISOString()
  const msg = {
    id: randomUUID(),
    thread_id: threadId,
    sender_id: me.id,
    content: content?.trim() ?? "",
    created_at: now,
    attachment_url: hasAttachment ? attachment!.url : null,
    attachment_name: hasAttachment ? (attachment!.name ?? "file") : null,
    attachment_type: hasAttachment ? (attachment!.type ?? "") : null,
  }
  const { error } = await sb().from("dm_messages").insert(msg)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  await sb().from("dm_threads").update({ last_message_at: now }).eq("id", threadId)

  const out: DirectMessage = {
    id: msg.id,
    threadId,
    senderId: me.id,
    senderName: me.name,
    content: msg.content,
    createdAt: now,
    attachment: hasAttachment
      ? { url: attachment!.url as string, name: msg.attachment_name as string, type: msg.attachment_type as string }
      : null,
  }
  emit([`dm:${threadId}`, `user:${userId}`], "dm.message", { message: out }, me.id)

  // Notify the recipient unless they muted me or are in Do-Not-Disturb.
  const [{ data: muted }, { data: pref }] = await Promise.all([
    sb()
      .from("user_blocks")
      .select("blocker_id")
      .eq("blocker_id", userId)
      .eq("target_id", me.id)
      .eq("kind", "MUTE")
      .maybeSingle(),
    sb().from("user_preferences").select("dnd").eq("user_id", userId).maybeSingle(),
  ])
  if (!muted && !pref?.dnd) {
    const preview = msg.content || (hasAttachment ? "📎 Attachment" : "")
    await createNotification(userId, "dm", `${me.name}: ${preview}`.slice(0, 120), `/discord?dm=${me.id}`)
  }
  return Response.json(out, { status: 201 })
}
