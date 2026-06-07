import { repoFiles, getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghTreePaths, githubEnabled } from "@/lib/github"
import type { RepoFile } from "@/lib/types"

// GET /api/git/:wsId/files?branch= — flat list of repo files for a branch
// (path-only; content is loaded lazily via /file). Powers branch switching.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId)
  if (access instanceof Response) return access
  const branch = new URL(request.url).searchParams.get("branch") || "main"

  if (githubEnabled()) {
    const ws = await getWorkspace(wsId)
    if (ws) {
      const paths = await ghTreePaths(ws.githubRepo, branch)
      const files: RepoFile[] = paths.map((p) => ({
        id: `${wsId}:${branch}:${p}`,
        workspaceId: wsId,
        path: p,
        content: "",
        originalContent: "",
        status: "unmodified",
      }))
      return Response.json(files)
    }
  }
  return Response.json(await repoFiles(wsId))
}
