import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// GET /api/discord/admin/threads — SUPER_ADMIN moderation view: every
// conversation (1:1 and group) with a display name + last message.
export async function GET() {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (me.role !== "SUPER_ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 })

  const { data: threads } = await sb()
    .from("dm_threads")
    .select("id,is_group,name,last_message_at")
    .order("last_message_at", { ascending: false })
  const threadIds = (threads ?? []).map((t) => t.id as string)
  if (threadIds.length === 0) return Response.json([])

  const [{ data: parts }, { data: msgs }] = await Promise.all([
    sb().from("dm_participants").select("thread_id,user_id").in("thread_id", threadIds),
    sb().from("dm_messages").select("thread_id,content,created_at").in("thread_id", threadIds).order("created_at", { ascending: false }),
  ])
  const partsByThread = new Map<string, string[]>()
  const userIds = new Set<string>()
  for (const p of parts ?? []) {
    const arr = partsByThread.get(p.thread_id as string) ?? []
    arr.push(p.user_id as string)
    partsByThread.set(p.thread_id as string, arr)
    userIds.add(p.user_id as string)
  }
  const { data: users } = userIds.size
    ? await sb().from("users").select("id,name").in("id", [...userIds])
    : { data: [] }
  const nameById = new Map((users ?? []).map((u) => [u.id as string, u.name as string]))
  const lastByThread = new Map<string, string>()
  for (const m of msgs ?? []) {
    if (!lastByThread.has(m.thread_id as string)) lastByThread.set(m.thread_id as string, m.content as string)
  }

  return Response.json(
    (threads ?? []).map((t) => {
      const ids = partsByThread.get(t.id as string) ?? []
      const memberNames = ids.map((id) => nameById.get(id) ?? "User")
      return {
        threadId: t.id as string,
        isGroup: !!t.is_group,
        name: t.is_group ? (t.name as string) || "Group" : memberNames.join(" ↔ "),
        memberCount: ids.length,
        lastMessage: lastByThread.get(t.id as string) ?? "",
        lastAt: t.last_message_at as string,
      }
    })
  )
}
