import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { SEL, sb } from "@/lib/data"
import { requireTicket } from "@/lib/auth/guard"
import { validateUploads } from "@/lib/uploads"
import { storageEnabled, uploadDataUrl } from "@/lib/storage"

// POST /api/tickets/:id/attachments — upload files (base64 data URLs).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const body = (await request.json()) as {
    files?: { name: string; mimeType: string; size: number; dataUrl: string }[]
  }
  if (!body.files?.length) return Response.json({ error: "files required" }, { status: 400 })
  const invalid = validateUploads(body.files)
  if (invalid) return Response.json({ error: invalid }, { status: 400 })
  const rows = await Promise.all(
    body.files.map(async (f) => {
      const useStore = storageEnabled()
      const storagePath = useStore
        ? await uploadDataUrl(`attachments/${id}`, f.name, f.dataUrl)
        : null
      return {
        id: randomUUID(),
        ticket_id: id,
        name: f.name,
        mime_type: f.mimeType || "application/octet-stream",
        size: f.size,
        data_url: useStore ? null : f.dataUrl,
        storage_path: storagePath,
        uploaded_by_id: user.id,
        created_at: new Date().toISOString(),
      }
    })
  )
  const { error } = await sb().from("ticket_attachments").insert(rows)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  const { data } = await sb().from("ticket_attachments").select(SEL.attachment).eq("ticket_id", id).order("created_at")
  return Response.json(data ?? [], { status: 201 })
}
