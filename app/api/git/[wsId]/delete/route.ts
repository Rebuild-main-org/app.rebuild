import { getWorkspace } from "@/lib/queries"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghDeleteFile, githubEnabled } from "@/lib/github"

// POST /api/git/:wsId/delete — delete one or more files (a file, or every file
// under a folder), each as a commit. Body: { paths: string[], message, branch }.
// GitHub-backed only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const { paths, message, branch } = (await request.json()) as {
    paths?: string[]
    message?: string
    branch?: string
  }
  const list = (paths ?? []).filter((p) => typeof p === "string" && p.trim())
  if (list.length === 0) return Response.json({ error: "paths are required" }, { status: 400 })
  if (!githubEnabled()) {
    return Response.json({ error: "Delete requires a connected GitHub repo" }, { status: 400 })
  }
  const ws = await getWorkspace(wsId)
  if (!ws) return Response.json({ error: "Not found" }, { status: 404 })

  const msg = message?.trim() || `Delete ${list.length === 1 ? list[0] : `${list.length} files`}`
  try {
    // Sequential: the GitHub Contents API needs the current sha per file.
    for (const path of list) {
      await ghDeleteFile(ws.githubRepo, path, msg, branch || "main")
    }
    return Response.json({ ok: true, deleted: list })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 502 })
  }
}
