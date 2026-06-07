import { projectsForWorkspace } from "@/lib/queries"
import { createProject } from "@/lib/mutations"
import type { Project } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  return Response.json(projectsForWorkspace(id))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const body = (await request.json()) as Partial<Project>
  if (!body.name || !body.shortCode) {
    return Response.json(
      { error: "name and shortCode are required" },
      { status: 400 }
    )
  }
  try {
    const project = await createProject(id, {
      name: body.name,
      shortCode: body.shortCode,
      description: body.description ?? "",
      status: body.status,
    })
    return Response.json(project, { status: 201 })
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400
    return Response.json({ error: e instanceof Error ? e.message : "Could not create project" }, { status })
  }
}
