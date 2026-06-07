import { getRepoFile, getWorkspace } from "@/lib/queries"
import { commitChanges, createFile, saveFile } from "@/lib/mutations"
import { requireWorkspace } from "@/lib/auth/guard"
import { ghPutFile, ghReadFile, githubEnabled } from "@/lib/github"

// GET /api/git/:wsId/file?path=&branch= — file content + status (on a branch).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const { searchParams } = new URL(request.url)
  const path = searchParams.get("path")
  const branch = searchParams.get("branch") || undefined
  if (!path) return Response.json({ error: "path required" }, { status: 400 })

  // GitHub-backed: read the file from the selected branch.
  if (githubEnabled()) {
    const ws = await getWorkspace(wsId)
    if (ws) {
      const content = await ghReadFile(ws.githubRepo, path, branch)
      if (content == null) return Response.json({ error: "Not found" }, { status: 404 })
      return Response.json({
        id: `${wsId}:${path}`,
        workspaceId: wsId,
        path,
        content,
        originalContent: content,
        status: "unmodified",
      })
    }
  }

  const file = await getRepoFile(wsId, path)
  if (!file) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(file)
}

// PUT /api/git/:wsId/file — modify a file and optionally commit it.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params
  const _access = await requireWorkspace(wsId, "code.access")
  if (_access instanceof Response) return _access
  const body = (await request.json()) as {
    path?: string
    content?: string
    create?: boolean
    commitMessage?: string
    branch?: string
  }
  if (!body.path || body.content == null) {
    return Response.json({ error: "path and content required" }, { status: 400 })
  }

  // GitHub-backed: writing a file IS a commit (= push) via the Contents API.
  if (githubEnabled()) {
    const ws = await getWorkspace(wsId)
    if (ws) {
      try {
        const res = await ghPutFile(
          ws.githubRepo,
          body.path,
          body.content,
          body.commitMessage || `Update ${body.path}`,
          body.branch || "main"
        )
        const file = {
          id: `${wsId}:${body.path}`,
          workspaceId: wsId,
          path: body.path,
          content: body.content,
          originalContent: body.content,
          status: "unmodified" as const,
        }
        return Response.json({ file, commit: { hash: res.commitSha?.slice(0, 7) ?? "pushed" } })
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "GitHub write failed" }, { status: 502 })
      }
    }
  }

  let file = await getRepoFile(wsId, body.path)
  if (!file && body.create) {
    file = await createFile(wsId, body.path, body.content)
  } else if (file) {
    file = (await saveFile(wsId, body.path, body.content)) ?? file
  } else {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  let commit = null
  if (body.commitMessage) {
    commit = await commitChanges(wsId, body.commitMessage, body.branch ?? "main", [
      body.path,
    ])
  }
  return Response.json({ file, commit })
}
