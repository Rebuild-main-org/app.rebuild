import { requireProject } from "@/lib/auth/guard"
import { AINotConfiguredError, triageTicket } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { membersForWorkspace, ticketsForWorkspace, workspaceIdForProject } from "@/lib/queries"

const ENG_ROLES = ["ENGINEER", "QA", "DESIGNER", "LEAD"]

// POST /api/ai/triage — suggest type/priority/assignee for a new ticket.
export async function POST(request: Request) {
  const { projectId, title, description } = (await request.json()) as {
    projectId?: string
    title?: string
    description?: string
  }
  if (!projectId || !title?.trim()) {
    return Response.json({ error: "projectId and title required" }, { status: 400 })
  }
  const auth = await requireProject(projectId, "copilot.use")
  if (auth instanceof Response) return auth

  const wsId = await workspaceIdForProject(projectId)
  const [members, tickets] = await Promise.all([
    wsId ? membersForWorkspace(wsId) : Promise.resolve([]),
    wsId ? ticketsForWorkspace(wsId) : Promise.resolve([]),
  ])
  const load = new Map<string, number>()
  for (const t of tickets) {
    if (t.assigneeId && t.status !== "DONE") load.set(t.assigneeId, (load.get(t.assigneeId) ?? 0) + 1)
  }
  const candidates = members
    .filter((m) => ENG_ROLES.includes(m.user.role))
    .map((m) => ({ id: m.user.id, name: m.user.name, role: m.user.role, openLoad: load.get(m.user.id) ?? 0 }))

  try {
    const suggestion = await withAi(auth, "triage", () => triageTicket({ title, description: description ?? "", candidates }), { projectId })
    return Response.json(suggestion)
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: "Triage failed" }, { status: 502 })
  }
}
