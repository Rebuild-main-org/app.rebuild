import { reorderColumn } from "@/lib/mutations"
import type { TicketStatus } from "@/lib/types"
import { requireProject } from "@/lib/auth/guard"

// Persists the Kanban board after a drag & drop: one column's full ordering.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireProject(id)
  if (_access instanceof Response) return _access
  const { status, orderedIds } = (await request.json()) as {
    status: TicketStatus
    orderedIds: string[]
  }
  reorderColumn(id, status, orderedIds)
  return Response.json({ ok: true })
}
