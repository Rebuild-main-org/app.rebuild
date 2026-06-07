import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb } from "@/lib/data"
import { downloadObject, removeObject } from "@/lib/storage"
import { requireDocument } from "@/lib/auth/guard"

// GET /api/documents/:id — download a document (decoded from its data URL).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireDocument(id)
  if (_access instanceof Response) return _access
  const { data: doc } = await sb()
    .from("documents")
    .select("name,mime_type,data_url,storage_path")
    .eq("id", id)
    .maybeSingle()
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 })
  const bytes = doc.storage_path
    ? await downloadObject(doc.storage_path as string)
    : Buffer.from(String(doc.data_url).split(",")[1] ?? "", "base64")
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime_type as string,
      "Content-Disposition": `attachment; filename="${String(doc.name).split("/").pop()}"`,
    },
  })
}

// DELETE /api/documents/:id — uploader, lead or admin may delete.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireDocument(id)
  if (_access instanceof Response) return _access
  const { data: doc } = await sb()
    .from("documents")
    .select("uploaded_by_id,storage_path")
    .eq("id", id)
    .maybeSingle()
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 })
  if (doc.uploaded_by_id !== user.id && !can(user, "workspace.edit")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  if (doc.storage_path) await removeObject(doc.storage_path as string)
  await sb().from("documents").delete().eq("id", id)
  return Response.json({ ok: true })
}
