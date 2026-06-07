import { sb } from "@/lib/data"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

// GET /api/discord/notes/:userId — my private note about that member.
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { userId } = await params
  const { data } = await sb()
    .from("member_notes")
    .select("content")
    .eq("author_id", me.id)
    .eq("subject_id", userId)
    .maybeSingle()
  return Response.json({ content: (data?.content as string) ?? "" })
}

// PUT /api/discord/notes/:userId { content } — save my private note (only I see it).
export async function PUT(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const me = await getSessionUser()
  if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { userId } = await params
  const { content } = (await request.json()) as { content?: string }
  const { error } = await sb().from("member_notes").upsert(
    {
      author_id: me.id,
      subject_id: userId,
      content: content ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "author_id,subject_id" }
  )
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
