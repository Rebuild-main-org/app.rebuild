import { randomUUID } from "crypto"

import { SEL, sb } from "@/lib/data"
import { userFromBearer } from "@/lib/cli-auth"
import { isWorkspaceMember } from "@/lib/auth/guard"
import { isAdmin } from "@/lib/auth"
import { storageEnabled, uploadDataUrl } from "@/lib/storage"
import { emit } from "@/lib/events"
import type { Project } from "@/lib/types"

export const dynamic = "force-dynamic"

const MAX_BYTES = 8 * 1024 * 1024 // ~8MB per screenshot

// POST /api/cli/document (Bearer) — upload a file (e.g. a screenshot) to a
// project's Documents. Body: { project, name, mimeType, dataUrl }.
export async function POST(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { project, name, mimeType, dataUrl } = (await request.json()) as {
    project?: string
    name?: string
    mimeType?: string
    dataUrl?: string
  }
  const q = project?.trim()
  if (!q) return Response.json({ error: "project is required" }, { status: 400 })
  if (!name?.trim() || !dataUrl) return Response.json({ error: "name and dataUrl are required" }, { status: 400 })
  if (dataUrl.length > MAX_BYTES * 1.4) return Response.json({ error: "File too large (max ~8MB)" }, { status: 413 })

  // Resolve the project by name or short code (mirrors /api/cli/context).
  const { data: projRows } = await sb()
    .from("projects")
    .select(SEL.project)
    .or(`name.ilike.${q},short_code.ilike.${q}`)
  const projects = (projRows ?? []) as Project[]
  let chosen: Project | undefined
  for (const p of projects) {
    if (isAdmin(user.role) || (await isWorkspaceMember(user.id, p.workspaceId))) {
      chosen = p
      break
    }
  }
  if (!chosen) return Response.json({ error: `No accessible project "${q}"` }, { status: 403 })

  const m = /^data:([^;]*);base64,(.*)$/.exec(dataUrl)
  const size = m ? Buffer.byteLength(m[2], "base64") : dataUrl.length
  const mime = mimeType || m?.[1] || "application/octet-stream"

  // Honour Supabase Storage when configured, else store the base64 data URL.
  const useStore = storageEnabled()
  const storagePath = useStore
    ? await uploadDataUrl(`documents/${chosen.workspaceId}`, name.trim(), dataUrl)
    : null
  const id = randomUUID()
  const row = {
    id,
    name: name.trim(),
    mime_type: mime,
    size,
    data_url: useStore ? null : dataUrl,
    storage_path: storagePath,
    workspace_id: chosen.workspaceId,
    project_id: chosen.id,
    uploaded_by_id: user.id,
    created_at: new Date().toISOString(),
  }
  const { error } = await sb().from("documents").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  emit([`ws:${chosen.workspaceId}`, `project:${chosen.id}`], "document.added", { id, name: row.name }, user.id)
  return Response.json({ id, name: row.name }, { status: 201 })
}
