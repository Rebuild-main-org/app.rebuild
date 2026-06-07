import { randomUUID } from "crypto"

import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// POST /api/discord/groups { name, memberIds[] } — create a group room with me
// plus the chosen members. Returns { threadId }.
export async function POST(request: Request) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { name, memberIds } = (await request.json()) as { name?: string; memberIds?: string[] }

  const others = [...new Set((memberIds ?? []).filter((id) => id && id !== me.id))]
  if (others.length < 1) return Response.json({ error: "Pick at least one member" }, { status: 400 })

  // Validate the members exist.
  const { data: valid } = await sb().from("users").select("id").in("id", others)
  const validIds = (valid ?? []).map((u) => u.id as string)
  if (validIds.length === 0) return Response.json({ error: "No valid members" }, { status: 400 })

  const id = randomUUID()
  const now = new Date().toISOString()
  await sb().from("dm_threads").insert({
    id,
    is_group: true,
    name: name?.trim() || "Group",
    created_by: me.id,
    created_at: now,
    last_message_at: now,
  })
  const everyone = [me.id, ...validIds]
  await sb().from("dm_participants").upsert(
    everyone.map((user_id) => ({ thread_id: id, user_id })),
    { onConflict: "thread_id,user_id" }
  )
  await sb().from("dm_reads").upsert(
    everyone.map((user_id) => ({ thread_id: id, user_id, last_read_at: now })),
    { onConflict: "thread_id,user_id" }
  )
  return Response.json({ threadId: id }, { status: 201 })
}
