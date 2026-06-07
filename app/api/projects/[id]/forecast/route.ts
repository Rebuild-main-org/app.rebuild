import { requireProject } from "@/lib/auth/guard"
import { forecastForProject } from "@/lib/queries"

// GET /api/projects/:id/forecast — velocity-based completion estimate.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id)
  if (access instanceof Response) return access
  return Response.json(await forecastForProject(id))
}
