import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// GET /api/discord/search?q= — search the caller's direct messages.
export async function GET(request: Request) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const q = new URL(request.url).searchParams.get("q")?.trim()
  if (!q || q.length < 2) return Response.json([])

  // My threads → the other participant per thread.
  const { data: threads } = await sb()
    .from("dm_threads")
    .select("id,user_a,user_b")
    .or(`user_a.eq.${me.id},user_b.eq.${me.id}`)
  const threadIds = (threads ?? []).map((t) => t.id as string)
  if (threadIds.length === 0) return Response.json([])
  const otherByThread = new Map(
    (threads ?? []).map((t) => [t.id as string, (t.user_a === me.id ? t.user_b : t.user_a) as string])
  )

  const { data: msgs } = await sb()
    .from("dm_messages")
    .select("id,thread_id,sender_id,content,created_at")
    .in("thread_id", threadIds)
    .ilike("content", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(30)

  const otherIds = [...new Set((msgs ?? []).map((m) => otherByThread.get(m.thread_id as string)!).filter(Boolean))]
  const { data: users } = otherIds.length
    ? await sb().from("users").select("id,name,avatarUrl:avatar_url").in("id", otherIds)
    : { data: [] }
  const userMap = new Map((users ?? []).map((u) => [u.id as string, u]))

  return Response.json(
    (msgs ?? []).map((m) => {
      const otherId = otherByThread.get(m.thread_id as string)!
      const u = userMap.get(otherId)
      return {
        messageId: m.id as string,
        otherId,
        name: (u?.name as string) ?? "User",
        avatarUrl: (u?.avatarUrl as string) ?? undefined,
        content: m.content as string,
        createdAt: m.created_at as string,
      }
    })
  )
}
