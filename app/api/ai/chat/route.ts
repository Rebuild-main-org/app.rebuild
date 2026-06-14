import { can } from "@/lib/auth"
import { getSessionUser } from "@/lib/auth/session"
import { AINotConfiguredError, chat, type ChatTurn } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { getProject, getWorkspace, myTickets, ticketsForProject } from "@/lib/queries"
import { rateLimitResponse } from "@/lib/ratelimit"

// POST /api/ai/chat — contextual Copilot. Builds project/workspace context
// server-side so the model knows where the user is.
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "copilot.use")) {
    return Response.json({ error: "Copilot not available for your role" }, { status: 403 })
  }
  const rl = rateLimitResponse(`ai:${user.id}`, 20, 60_000)
  if (rl) return rl
  const body = (await request.json()) as {
    message?: string
    history?: ChatTurn[]
    page?: string
    workspaceId?: string
    projectId?: string
    extraContext?: string
  }
  if (!body.message?.trim()) {
    return Response.json({ error: "message required" }, { status: 400 })
  }

  const parts: string[] = [`User: ${user.name} (${user.role})`]
  if (body.page) parts.push(`Page: ${body.page}`)
  if (body.workspaceId) {
    const ws = await getWorkspace(body.workspaceId)
    if (ws) parts.push(`Workspace: ${ws.name} — repo ${ws.githubRepo}, client ${ws.clientName}`)
  }
  if (body.projectId) {
    const project = await getProject(body.projectId)
    if (project) {
      const tickets = await ticketsForProject(body.projectId)
      const open = tickets.filter((t) => t.status !== "DONE")
      parts.push(
        `Project: ${project.name} (${project.status}). ${tickets.length} tickets, ${open.length} open.`
      )
      const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS")
      if (inProgress.length)
        parts.push(
          `In progress: ${inProgress.map((t) => `${t.shortId} ${t.title}`).join("; ")}`
        )
    }
  }
  const mine = await myTickets(user.id)
  parts.push(`Open tickets assigned to you: ${mine.filter((t) => t.status !== "DONE").length}`)

  if (body.extraContext) parts.push(body.extraContext.slice(0, 4000))

  const message = body.message.trim()
  try {
    const traceRef: { id?: string } = {}
    const reply = await withAi(
      user,
      "chat",
      () =>
        chat({
          context: parts.join("\n"),
          history: (body.history ?? []).slice(-8),
          message,
        }),
      { workspaceId: body.workspaceId, projectId: body.projectId, traceRef }
    )
    return Response.json({ reply, traceId: traceRef.id })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) {
      return Response.json({ error: e.message }, { status: 503 })
    }
    return Response.json({ error: "AI request failed" }, { status: 502 })
  }
}
