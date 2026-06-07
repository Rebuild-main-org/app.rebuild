import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { emit } from "@/lib/events"
import type { Message } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"
import { createNotification } from "@/lib/mutations"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const [{ data }, users] = await Promise.all([
    sb().from("messages").select(SEL.message).eq("workspace_id", id).order("created_at"),
    getUsersMap(),
  ])
  return Response.json(
    ((data ?? []) as Message[]).map((m) => ({ ...m, author: users.get(m.authorId) }))
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const { content } = (await request.json()) as { content?: string }
  if (!content?.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 })
  }
  const message: Message = {
    id: randomUUID(),
    content: content.trim(),
    authorId: user.id,
    workspaceId: id,
    isFromClient: user.role === "CLIENT",
    createdAt: new Date().toISOString(),
  }
  const { error } = await sb().from("messages").insert({
    id: message.id,
    content: message.content,
    author_id: user.id,
    workspace_id: id,
    is_from_client: message.isFromClient,
    created_at: message.createdAt,
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  const withAuthor = { ...message, author: user }
  emit(`ws:${id}`, "message.created", { message: withAuthor }, user.id)

  // Notify every other workspace member of the new message (click → chat).
  const { data: members } = await sb()
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", id)
  const preview = message.content.length > 60 ? message.content.slice(0, 60) + "…" : message.content
  for (const m of members ?? []) {
    const uid = m.user_id as string
    if (uid === user.id) continue
    await createNotification(uid, "message", `${user.name}: ${preview}`, `/workspace/${id}/chat`)
  }
  return Response.json(withAuthor, { status: 201 })
}
