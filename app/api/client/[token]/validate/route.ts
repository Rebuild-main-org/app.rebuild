import { SEL, sb } from "@/lib/data"
import { verifyPortalToken } from "@/lib/portal"
import { emit } from "@/lib/events"
import { createNotification } from "@/lib/mutations"
import type { Milestone, Project, Workspace } from "@/lib/types"

// POST /api/client/:token/validate — the client approves a milestone or
// requests changes from the portal (spec §11). Token resolves to a workspace.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const wsId = verifyPortalToken(token)
  if (!wsId) return Response.json({ error: "Invalid portal" }, { status: 404 })
  const { data: wsRow } = await sb()
    .from("workspaces")
    .select(SEL.workspace)
    .eq("id", wsId)
    .maybeSingle()
  const ws = wsRow as Workspace | null
  if (!ws) return Response.json({ error: "Invalid portal" }, { status: 404 })

  const { milestoneId, decision, feedback } = (await request.json()) as {
    milestoneId?: string
    decision?: "approve" | "changes"
    feedback?: string
  }
  const { data: msRow } = await sb().from("milestones").select(SEL.milestone).eq("id", milestoneId ?? "").maybeSingle()
  const milestone = msRow as Milestone | null
  if (!milestone) return Response.json({ error: "Not found" }, { status: 404 })

  // Ensure the milestone belongs to a project in this workspace.
  const { data: pRow } = await sb().from("projects").select(SEL.project).eq("id", milestone.projectId).maybeSingle()
  const project = pRow as Project | null
  if (!project || project.workspaceId !== ws.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const approve = decision === "approve"
  await sb()
    .from("milestones")
    .update({
      client_feedback: feedback?.trim() || null,
      validated_by_client: approve,
      validated_at: approve ? new Date().toISOString() : null,
    })
    .eq("id", milestone.id)

  const { data: members } = await sb().from("workspace_members").select("user_id").eq("workspace_id", ws.id)
  for (const m of members ?? []) {
    await createNotification(
      m.user_id as string,
      "milestone_validated",
      approve
        ? `Client approved milestone "${milestone.title}"`
        : `Client requested changes on "${milestone.title}"`,
      `/workspace/${ws.id}/overview`
    )
  }
  emit(`ws:${ws.id}`, "milestone.validated", { milestoneId: milestone.id })

  return Response.json({ milestone: { ...milestone, validatedByClient: approve, clientFeedback: feedback?.trim() } })
}
