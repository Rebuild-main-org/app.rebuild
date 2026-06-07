import { requireSprint } from "@/lib/auth/guard"
import {
  burndownForSprint,
  captureSprintSnapshot,
  velocityForProject,
} from "@/lib/queries"
import { sb } from "@/lib/data"

// GET /api/sprints/:id/snapshot — burndown series + project velocity.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireSprint(id)
  if (access instanceof Response) return access
  const { data: sprint } = await sb().from("sprints").select("project_id").eq("id", id).maybeSingle()
  const [burndown, velocity] = await Promise.all([
    burndownForSprint(id),
    sprint?.project_id
      ? velocityForProject(sprint.project_id as string)
      : Promise.resolve([]),
  ])
  return Response.json({ burndown, velocity })
}

// POST /api/sprints/:id/snapshot — capture today's burndown point. Call from a
// daily cron (or manually). Requires sprint membership.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireSprint(id)
  if (access instanceof Response) return access
  await captureSprintSnapshot(id)
  return Response.json({ ok: true }, { status: 201 })
}
