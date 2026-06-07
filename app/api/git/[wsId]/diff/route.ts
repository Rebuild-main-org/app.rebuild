import { getRepoFile, repoFiles } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"

// GET /api/git/:wsId/diff?path= — working diff (committed vs current) for one
// file, or the list of all changed files when no path is given.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const path = new URL(request.url).searchParams.get("path")

  if (path) {
    const file = await getRepoFile(wsId, path)
    if (!file) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json({
      path: file.path,
      status: file.status,
      original: file.originalContent,
      modified: file.content,
    })
  }

  const changed = (await repoFiles(wsId))
    .filter((f) => f.status !== "unmodified")
    .map((f) => ({ path: f.path, status: f.status }))
  return Response.json(changed)
}
