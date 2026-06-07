import { userById } from "@/lib/data"
import { addComment } from "@/lib/mutations"
import { requireTicket } from "@/lib/auth/guard"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const { content } = (await request.json()) as { content?: string }
  if (!content?.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 })
  }
  const comment = await addComment(id, content.trim())
  if (!comment) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(
    { ...comment, author: await userById(comment.authorId) },
    { status: 201 }
  )
}
