import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { getBlueprint, updateBlueprint, type BlueprintDoc } from "@/lib/blueprints"
import { storageEnabled, uploadObject } from "@/lib/storage"

export const dynamic = "force-dynamic"

async function guard() {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) return null
  return user
}

// POST /api/blueprints/:id/documents (multipart: file) — attach a file to the
// blueprint. Bytes go to the Supabase bucket when configured (no base64);
// otherwise they fall back to an inline data URL so the app still works.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return Response.json({ error: "file requis" }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = file.type || "application/octet-stream"
  const doc: BlueprintDoc = { id: randomUUID(), name: file.name, mimeType: mime, size: bytes.length }

  if (storageEnabled()) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    doc.path = await uploadObject(`blueprints/${id}/${doc.id}-${safe}`, bytes, mime)
  } else {
    doc.dataUrl = `data:${mime};base64,${bytes.toString("base64")}`
  }

  const documents = [...(bp.documents ?? []), doc]
  await updateBlueprint(id, { documents })
  return Response.json({ document: doc, documents }, { status: 201 })
}

// DELETE /api/blueprints/:id/documents?docId=... — detach a document.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  const docId = new URL(request.url).searchParams.get("docId")
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  const documents = (bp.documents ?? []).filter((d) => d.id !== docId)
  await updateBlueprint(id, { documents })
  return Response.json({ documents })
}
