import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// GET /api/discord/unread → { total } unread direct/group messages for the caller.
export async function GET() {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { data: myParts } = await sb().from("dm_participants").select("thread_id").eq("user_id", me.id)
  const threadIds = (myParts ?? []).map((p) => p.thread_id as string)
  if (threadIds.length === 0) return Response.json({ total: 0 })

  const [{ data: msgs }, { data: reads }] = await Promise.all([
    sb().from("dm_messages").select("thread_id,created_at,sender_id").in("thread_id", threadIds).neq("sender_id", me.id),
    sb().from("dm_reads").select("thread_id,last_read_at").eq("user_id", me.id).in("thread_id", threadIds),
  ])
  const readMap = new Map((reads ?? []).map((r) => [r.thread_id as string, new Date(r.last_read_at as string).getTime()]))
  let total = 0
  for (const m of msgs ?? []) {
    const lastRead = readMap.get(m.thread_id as string) ?? 0
    if (new Date(m.created_at as string).getTime() > lastRead) total++
  }
  return Response.json({ total })
}
