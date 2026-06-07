import { AINotConfiguredError, summarize } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { getProject, milestonesForProject, ticketsForProject } from "@/lib/queries"
import { STATUS_LABELS } from "@/lib/types"
import { requireProject } from "@/lib/auth/guard"
import { rateLimitResponse } from "@/lib/ratelimit"

// POST /api/ai/summary — AI summary of a project or sprint.
export async function POST(request: Request) {
  const { kind, projectId } = (await request.json()) as {
    kind?: "project" | "sprint"
    projectId?: string
  }
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 })
  const auth = await requireProject(projectId, "copilot.use")
  if (auth instanceof Response) return auth
  const rl = rateLimitResponse(`ai:${auth.id}`, 20, 60_000)
  if (rl) return rl
  const project = await getProject(projectId)
  if (!project) return Response.json({ error: "Not found" }, { status: 404 })

  const tickets = await ticketsForProject(projectId)
  const lines = tickets.map(
    (t) => `- [${STATUS_LABELS[t.status]}] ${t.shortId} ${t.title} (${t.priority}${t.points ? `, ${t.points}pts` : ""})`
  )
  const milestones = (await milestonesForProject(projectId)).map(
    (m) => `- ${m.title}: due ${new Date(m.dueDate).toLocaleDateString()}${m.done ? " (done)" : ""}`
  )

  const content = `Project: ${project.name} (status ${project.status})\nDescription: ${project.description}\n\nTickets:\n${lines.join("\n")}\n\nMilestones:\n${milestones.join("\n")}`

  try {
    const summary = await withAi(auth, "summary", () => summarize({ kind: kind ?? "project", content }), { projectId })
    return Response.json({ summary })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) {
      return Response.json({ error: e.message }, { status: 503 })
    }
    return Response.json({ error: "Summary failed" }, { status: 502 })
  }
}
