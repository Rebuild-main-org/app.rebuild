import { commitChanges } from "@/lib/mutations"
import { requireWorkspace } from "@/lib/auth/guard"

// POST /api/git/:wsId/commit — commit all (or selected) working changes.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId, "code.access")
  if (_access instanceof Response) return _access
  const { message, branch, paths } = (await request.json()) as {
    message?: string
    branch?: string
    paths?: string[]
  }
  if (!message?.trim()) {
    return Response.json({ error: "message required" }, { status: 400 })
  }
  const commit = commitChanges(wsId, message.trim(), branch ?? "main", paths)
  if (!commit) {
    return Response.json({ error: "Nothing to commit" }, { status: 400 })
  }
  return Response.json(commit, { status: 201 })
}
