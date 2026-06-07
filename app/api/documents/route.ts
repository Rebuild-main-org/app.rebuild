import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { requireWorkspace } from "@/lib/auth/guard"
import { validateUploads } from "@/lib/uploads"
import { storageEnabled, uploadDataUrl } from "@/lib/storage"

export const dynamic = "force-dynamic"

// GET /api/documents?workspaceId=&projectId= — list documents in scope.
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get("workspaceId")
  const projectId = searchParams.get("projectId")
  if (!workspaceId) return Response.json({ error: "workspaceId required" }, { status: 400 })
  const gAccess = await requireWorkspace(workspaceId)
  if (gAccess instanceof Response) return gAccess

  let q = sb().from("documents").select(SEL.document).eq("workspace_id", workspaceId)
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null)
  const [{ data }, users] = await Promise.all([
    q.order("created_at", { ascending: false }),
    getUsersMap(),
  ])
  return Response.json(
    (data ?? []).map((d) => ({ ...d, uploadedBy: users.get(d.uploadedById)?.name }))
  )
}

// POST /api/documents — upload one or more files (base64 data URLs).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json()) as {
    workspaceId?: string
    projectId?: string
    files?: { name: string; mimeType: string; size: number; dataUrl: string }[]
  }
  if (!body.workspaceId || !body.files?.length) {
    return Response.json({ error: "workspaceId and files are required" }, { status: 400 })
  }
  const pAccess = await requireWorkspace(body.workspaceId)
  if (pAccess instanceof Response) return pAccess
  const invalid = validateUploads(body.files)
  if (invalid) return Response.json({ error: invalid }, { status: 400 })
  const rows = await Promise.all(
    body.files.map(async (f) => {
      const useStore = storageEnabled()
      const storagePath = useStore
        ? await uploadDataUrl(`documents/${body.workspaceId}`, f.name, f.dataUrl)
        : null
      return {
        id: randomUUID(),
        name: f.name,
        mime_type: f.mimeType || "application/octet-stream",
        size: f.size,
        data_url: useStore ? null : f.dataUrl,
        storage_path: storagePath,
        workspace_id: body.workspaceId!,
        project_id: body.projectId ?? null,
        uploaded_by_id: user.id,
        created_at: new Date().toISOString(),
      }
    })
  )
  const { error } = await sb().from("documents").insert(rows)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ count: rows.length, ids: rows.map((r) => r.id) }, { status: 201 })
}
