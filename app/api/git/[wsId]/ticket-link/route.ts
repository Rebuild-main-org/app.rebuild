import { sb } from "@/lib/data"
import { requireWorkspace } from "@/lib/auth/guard"

export const dynamic = "force-dynamic"

// GET /api/git/:wsId/ticket-link?shortId=ACME-142 — resolve a ticket short id
// (mentioned in a commit message) to its board deep link, within this workspace.
export async function GET(request: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params
  const access = await requireWorkspace(wsId, "code.access")
  if (access instanceof Response) return access
  const shortId = new URL(request.url).searchParams.get("shortId")?.trim()
  if (!shortId) return Response.json({ url: null })

  const { data: projects } = await sb().from("projects").select("id").eq("workspace_id", wsId)
  const projectIds = (projects ?? []).map((p) => p.id as string)
  if (projectIds.length === 0) return Response.json({ url: null })

  const { data: ticket } = await sb()
    .from("tickets")
    .select("id,project_id")
    .in("project_id", projectIds)
    .ilike("short_id", shortId)
    .maybeSingle()
  if (!ticket) return Response.json({ url: null })
  return Response.json({ url: `/workspace/${wsId}/projects/${ticket.project_id}/board?ticket=${ticket.id}` })
}
