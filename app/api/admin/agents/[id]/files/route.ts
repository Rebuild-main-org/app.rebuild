import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import { sb } from "@/lib/data"
import { AGENT_FILE_KINDS, type AgentFileKind } from "@/lib/types"

export const dynamic = "force-dynamic"

async function requireSuper() {
  const user = await getSessionUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (!isAdmin(user.role)) return { error: "Forbidden", status: 403 as const }
  return { user }
}

// PUT /api/admin/agents/:id/files { name, kind, content } — upsert one file
// (keyed by name within the agent).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  const { name, kind, content } = (await request.json()) as { name?: string; kind?: AgentFileKind; content?: string }
  if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 })
  const k: AgentFileKind = AGENT_FILE_KINDS.includes(kind as AgentFileKind) ? (kind as AgentFileKind) : "knowledge"
  const { error } = await sb().from("agent_files").upsert(
    {
      id: randomUUID(),
      agent_id: id,
      name: name.trim(),
      kind: k,
      content: content ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id,name" }
  )
  if (error) return Response.json({ error: error.message }, { status: 400 })
  await sb().from("agents").update({ updated_at: new Date().toISOString() }).eq("id", id)
  return Response.json({ ok: true })
}

// DELETE /api/admin/agents/:id/files?name=soul.md — delete one file.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { id } = await params
  const name = new URL(request.url).searchParams.get("name")
  if (!name) return Response.json({ error: "name required" }, { status: 400 })
  const { error } = await sb().from("agent_files").delete().eq("agent_id", id).eq("name", name)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
