import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb } from "@/lib/data"

export const dynamic = "force-dynamic"

const DOCS = ["skills", "soul", "architecture"] as const
type DocName = (typeof DOCS)[number]

// GET /api/admin/agent-docs → { skills, soul, architecture } (ADMIN).
export async function GET() {
  const user = await getSessionUser()
  if (!user || !can(user, "admin.panel")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { data } = await sb().from("agent_docs").select("name,content")
  const map = Object.fromEntries((data ?? []).map((d) => [d.name, d.content]))
  return Response.json({
    skills: map.skills ?? "",
    soul: map.soul ?? "",
    architecture: map.architecture ?? "",
  })
}

// PUT /api/admin/agent-docs { name, content } → upsert one doc (ADMIN).
export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user || !can(user, "admin.panel")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { name, content } = (await request.json()) as { name?: DocName; content?: string }
  if (!name || !DOCS.includes(name)) return Response.json({ error: "Invalid doc name" }, { status: 400 })
  const { error } = await sb()
    .from("agent_docs")
    .upsert({ name, content: content ?? "", updated_at: new Date().toISOString() }, { onConflict: "name" })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
