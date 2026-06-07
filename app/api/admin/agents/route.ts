import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

async function requireSuper() {
  const user = await getSessionUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (!isAdmin(user.role)) return { error: "Forbidden", status: 403 as const }
  return { user }
}

// GET /api/admin/agents — the agent library (with file counts).
export async function GET() {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const [{ data: agents }, { data: files }] = await Promise.all([
    sb().from("agents").select("id,name,description,created_at,updated_at").order("name"),
    sb().from("agent_files").select("agent_id"),
  ])
  const counts = new Map<string, number>()
  for (const f of files ?? []) counts.set(f.agent_id as string, (counts.get(f.agent_id as string) ?? 0) + 1)
  return Response.json(
    (agents ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      fileCount: counts.get(a.id as string) ?? 0,
    }))
  )
}

// POST /api/admin/agents { name, description } — create an agent.
export async function POST(request: Request) {
  const guard = await requireSuper()
  if ("error" in guard) return Response.json({ error: guard.error }, { status: guard.status })
  const { name, description } = (await request.json()) as { name?: string; description?: string }
  if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 })
  const now = new Date().toISOString()
  const id = randomUUID()
  const { error } = await sb().from("agents").insert({
    id,
    name: name.trim(),
    description: description?.trim() ?? "",
    created_by: guard.user.id,
    created_at: now,
    updated_at: now,
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ id, name: name.trim() }, { status: 201 })
}
