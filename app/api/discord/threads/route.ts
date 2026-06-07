import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"
import type { Availability, DmThread } from "@/lib/types"

export const dynamic = "force-dynamic"

const ONLINE_MS = 2 * 60_000

// GET /api/discord/threads — the caller's conversations (1:1 and groups), with
// the other participant / group members, last message, and unread count.
export async function GET() {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: myParts } = await sb().from("dm_participants").select("thread_id").eq("user_id", me.id)
  const threadIds = (myParts ?? []).map((p) => p.thread_id as string)
  if (threadIds.length === 0) return Response.json([])

  const [{ data: threads }, { data: parts }, { data: msgs }, { data: reads }] = await Promise.all([
    sb().from("dm_threads").select("id,is_group,name,created_by,last_message_at").in("id", threadIds),
    sb().from("dm_participants").select("thread_id,user_id").in("thread_id", threadIds),
    sb().from("dm_messages").select("thread_id,content,created_at,sender_id").in("thread_id", threadIds).order("created_at", { ascending: false }),
    sb().from("dm_reads").select("thread_id,last_read_at").eq("user_id", me.id).in("thread_id", threadIds),
  ])

  // Participant ids per thread + the full set of "other" users to resolve.
  const partsByThread = new Map<string, string[]>()
  const allUserIds = new Set<string>()
  for (const p of parts ?? []) {
    const arr = partsByThread.get(p.thread_id as string) ?? []
    arr.push(p.user_id as string)
    partsByThread.set(p.thread_id as string, arr)
    if (p.user_id !== me.id) allUserIds.add(p.user_id as string)
  }
  const ids = [...allUserIds]
  const [{ data: users }, { data: prefs }] = await Promise.all([
    ids.length ? sb().from("users").select("id,name,avatarUrl:avatar_url,lastSeenAt:last_seen_at").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? sb().from("user_preferences").select("user_id,availability").in("user_id", ids) : Promise.resolve({ data: [] }),
  ])
  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]))
  const availMap = new Map((prefs ?? []).map((p) => [p.user_id as string, p.availability as Availability]))
  const readMap = new Map((reads ?? []).map((r) => [r.thread_id as string, new Date(r.last_read_at as string).getTime()]))

  const lastByThread = new Map<string, { content: string; created_at: string }>()
  const unreadByThread = new Map<string, number>()
  for (const m of msgs ?? []) {
    const tid = m.thread_id as string
    if (!lastByThread.has(tid)) lastByThread.set(tid, { content: m.content as string, created_at: m.created_at as string })
    const lastRead = readMap.get(tid) ?? 0
    if (m.sender_id !== me.id && new Date(m.created_at as string).getTime() > lastRead) {
      unreadByThread.set(tid, (unreadByThread.get(tid) ?? 0) + 1)
    }
  }
  const now = Date.now()

  const out: DmThread[] = (threads ?? []).map((t) => {
    const tid = t.id as string
    const memberIds = (partsByThread.get(tid) ?? []).filter((u) => u !== me.id)
    const last = lastByThread.get(tid)
    const base = {
      threadId: tid,
      lastMessage: last?.content ?? "",
      lastAt: last?.created_at ?? (t.last_message_at as string),
      unread: unreadByThread.get(tid) ?? 0,
    }
    if (t.is_group) {
      return {
        ...base,
        isGroup: true,
        otherId: "",
        name: (t.name as string) || "Group",
        availability: "AVAILABLE" as Availability,
        online: false,
        createdBy: (t.created_by as string) ?? undefined,
        members: memberIds.map((id) => {
          const u = userMap.get(id)
          return { id, name: (u?.name as string) ?? "User", avatarUrl: (u?.avatarUrl as string) ?? undefined }
        }),
      }
    }
    const otherId = memberIds[0] ?? ""
    const u = userMap.get(otherId)
    const availability = availMap.get(otherId) ?? "AVAILABLE"
    const recent = u?.lastSeenAt ? now - new Date(u.lastSeenAt as string).getTime() < ONLINE_MS : false
    return {
      ...base,
      isGroup: false,
      otherId,
      name: (u?.name as string) ?? "User",
      avatarUrl: (u?.avatarUrl as string) ?? undefined,
      availability,
      online: recent && availability !== "INVISIBLE",
    }
  })
  // Newest activity first.
  out.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
  return Response.json(out)
}
