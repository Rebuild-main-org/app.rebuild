import { requireWorkspace } from "@/lib/auth/guard"
import { AINotConfiguredError, planFromArchitecture, type ScaffoldPlan } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { applyScaffoldPlan } from "@/lib/mutations"

// POST /api/workspaces/:id/scaffold — read an architecture doc and create the
// project(s) + a To-Do backlog, with sub-tasks and dependency links. project.create.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireWorkspace(id, "project.create")
  if (access instanceof Response) return access

  const body = (await request.json()) as { content?: string; preview?: boolean; plan?: ScaffoldPlan }

  // Human gate: `preview` returns the plan WITHOUT creating; the UI shows it,
  // then re-POSTs the approved `plan` to create (no second AI call).
  let plan = body.plan
  if (!plan) {
    const content = body.content
    if (!content?.trim() || content.trim().length < 30) {
      return Response.json({ error: "Provide the architecture document text" }, { status: 400 })
    }
    try {
      plan = await withAi(access, "scaffold", () => planFromArchitecture(content), { workspaceId: id })
    } catch (e) {
      if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
      if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
      return Response.json({ error: e instanceof Error ? e.message : "Planning failed" }, { status: 502 })
    }
    if (body.preview) return Response.json({ preview: plan })
  }
  if (!plan?.projects?.length) {
    return Response.json({ error: "Empty plan — nothing to create" }, { status: 400 })
  }

  const result = await applyScaffoldPlan(id, plan)
  return Response.json(result, { status: 201 })
}
