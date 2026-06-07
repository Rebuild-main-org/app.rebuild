import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"
import { addLink, removeLink } from "@/lib/mutations"
import type { LinkType } from "@/lib/types"
import { requireTicket } from "@/lib/auth/guard"

const TYPES: LinkType[] = ["BLOCKS", "RELATES", "DUPLICATES"]

// POST /api/tickets/:id/links — link to another ticket by key (e.g. ACME-142).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const _access = await requireTicket(id)
  if (_access instanceof Response) return _access
  const { toShortId, type } = (await request.json()) as { toShortId?: string; type?: LinkType }
  if (!toShortId || !TYPES.includes(type as LinkType)) {
    return Response.json({ error: "toShortId and a valid type are required" }, { status: 400 })
  }
  const { data: target } = await sb().from("tickets").select("id").eq("short_id", toShortId.trim().toUpperCase()).maybeSingle()
  if (!target) return Response.json({ error: `No ticket ${toShortId}` }, { status: 404 })
  try {
    const link = await addLink(id, target.id as string, type as LinkType)
    return Response.json(link, { status: 201 })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}

// DELETE /api/tickets/:id/links?linkId=
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  await params
  const linkId = new URL(request.url).searchParams.get("linkId")
  if (!linkId) return Response.json({ error: "linkId required" }, { status: 400 })
  await removeLink(linkId)
  return Response.json({ ok: true })
}
