import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"
import { requireAttachment } from "@/lib/auth/guard"
import { downloadObject, removeObject } from "@/lib/storage"

// GET /api/attachments/:id — download a ticket attachment.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireAttachment(id)
  if (_access instanceof Response) return _access
  const { data } = await sb().from("ticket_attachments").select("name,mime_type,data_url,storage_path").eq("id", id).maybeSingle()
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })
  const bytes = data.storage_path
    ? await downloadObject(data.storage_path as string)
    : Buffer.from(String(data.data_url).split(",")[1] ?? "", "base64")
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.mime_type as string,
      "Content-Disposition": `attachment; filename="${String(data.name).split("/").pop()}"`,
    },
  })
}

// DELETE /api/attachments/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireAttachment(id)
  if (_access instanceof Response) return _access
  const { data: row } = await sb().from("ticket_attachments").select("storage_path").eq("id", id).maybeSingle()
  if (row?.storage_path) await removeObject(row.storage_path as string)
  await sb().from("ticket_attachments").delete().eq("id", id)
  return Response.json({ ok: true })
}
