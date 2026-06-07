import { randomUUID } from "crypto"

import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"
import { createNotification } from "@/lib/mutations"
import { emit } from "@/lib/events"
import type { DirectMessage } from "@/lib/types"

export const dynamic = "force-dynamic"

async function membership(threadId: string, meId: string) {
  const { data } = await sb()
    .from("dm_participants")
    .select("user_id")
    .eq("thread_id", threadId)
  const members = (data ?? []).map((p) => p.user_id as string)
  return { members, isMember: members.includes(meId) }
}

// GET /api/discord/threads/:threadId — a thread (1:1 or group): meta + messages.
export async function GET(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { threadId } = await params
  const { members, isMember } = await membership(threadId, me.id)
  // SUPER_ADMIN can read any conversation (moderation); others must be members.
  const isSuper = me.role === "SUPER_ADMIN"
  if (!isMember && !isSuper) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { data: thread } = await sb().from("dm_threads").select("id,is_group,name").eq("id", threadId).maybeSingle()
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 })

  const { data: users } = await sb().from("users").select("id,name,avatarUrl:avatar_url").in("id", members)
  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]))

  const { data: rows } = await sb()
    .from("dm_messages")
    .select("id,threadId:thread_id,senderId:sender_id,content,createdAt:created_at,attachmentUrl:attachment_url,attachmentName:attachment_name,attachmentType:attachment_type")
    .eq("thread_id", threadId)
    .order("created_at")
  const messages: DirectMessage[] = (rows ?? []).map((r) => {
    const rec = r as Record<string, unknown>
    return {
      id: rec.id as string,
      threadId: rec.threadId as string,
      senderId: rec.senderId as string,
      senderName: (userMap.get(rec.senderId as string)?.name as string) ?? "User",
      content: rec.content as string,
      createdAt: rec.createdAt as string,
      attachment: rec.attachmentUrl
        ? { url: rec.attachmentUrl as string, name: (rec.attachmentName as string) ?? "file", type: (rec.attachmentType as string) ?? "" }
        : null,
    }
  })

  // Reactions per message.
  const ids = messages.map((m) => m.id)
  if (ids.length) {
    const { data: reactions } = await sb().from("dm_reactions").select("message_id,emoji,user_id").in("message_id", ids)
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

  // Advance my read marker (only if I'm actually a participant).
  if (isMember) {
    await sb()
      .from("dm_reads")
      .upsert({ thread_id: threadId, user_id: me.id, last_read_at: new Date().toISOString() }, { onConflict: "thread_id,user_id" })
  }

  const memberList = members
    .filter((id) => id !== me.id)
    .map((id) => ({ id, name: (userMap.get(id)?.name as string) ?? "User", avatarUrl: (userMap.get(id)?.avatarUrl as string) ?? undefined }))
  return Response.json({
    threadId,
    isGroup: !!thread.is_group,
    name: (thread.name as string) || "Group",
    members: memberList,
    messages,
  })
}

// POST /api/discord/threads/:threadId { content, attachment } — send to the thread.
export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { threadId } = await params
  const { members, isMember } = await membership(threadId, me.id)
  if (!isMember) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { content, attachment } = (await request.json()) as {
    content?: string
    attachment?: { url?: string; name?: string; type?: string } | null
  }
  const hasAttachment = !!attachment?.url
  if (!content?.trim() && !hasAttachment) return Response.json({ error: "content or attachment required" }, { status: 400 })
  if (hasAttachment && (attachment!.url as string).length > 4_200_000) {
    return Response.json({ error: "Attachment too large (max ~3MB)" }, { status: 413 })
  }

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
    attachment: hasAttachment ? { url: attachment!.url as string, name: msg.attachment_name as string, type: msg.attachment_type as string } : null,
  }
  const others = members.filter((id) => id !== me.id)
  emit([`dm:${threadId}`, ...others.map((id) => `user:${id}`)], "dm.message", { message: out }, me.id)

  // Notify other members (respecting mute + DND).
  const [{ data: mutes }, { data: prefs }] = await Promise.all([
    sb().from("user_blocks").select("blocker_id").eq("kind", "MUTE").eq("target_id", me.id).in("blocker_id", others),
    sb().from("user_preferences").select("user_id,dnd").in("user_id", others),
  ])
  const muted = new Set((mutes ?? []).map((m) => m.blocker_id as string))
  const dnd = new Set((prefs ?? []).filter((p) => p.dnd).map((p) => p.user_id as string))
  const { data: thread } = await sb().from("dm_threads").select("name").eq("id", threadId).maybeSingle()
  const groupName = (thread?.name as string) || "Group"
  const preview = msg.content || (hasAttachment ? "📎 Attachment" : "")
  for (const uid of others) {
    if (muted.has(uid) || dnd.has(uid)) continue
    await createNotification(uid, "dm", `${groupName} — ${me.name}: ${preview}`.slice(0, 120), `/discord?thread=${threadId}`)
  }
  return Response.json(out, { status: 201 })
}

// DELETE /api/discord/threads/:threadId — delete a group. Allowed for a
// SUPER_ADMIN (any group) or the group's creator. Cascades messages/participants.
export async function DELETE(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { threadId } = await params
  const { data: thread } = await sb()
    .from("dm_threads")
    .select("is_group,created_by")
    .eq("id", threadId)
    .maybeSingle()
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 })
  if (!thread.is_group) return Response.json({ error: "Only group rooms can be deleted" }, { status: 400 })
  if (me.role !== "SUPER_ADMIN" && thread.created_by !== me.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { error } = await sb().from("dm_threads").delete().eq("id", threadId)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
