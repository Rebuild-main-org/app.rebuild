import { requireWorkspace } from "@/lib/auth/guard"
import { AINotConfiguredError, standupDigest } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { commitsForWorkspace, ticketsForWorkspace } from "@/lib/queries"
import { STATUS_LABELS, type GitCommit } from "@/lib/types"

// POST /api/ai/standup — AI daily standup for a workspace.
export async function POST(request: Request) {
  const { workspaceId } = (await request.json()) as { workspaceId?: string }
  const auth = await requireWorkspace(workspaceId, "copilot.use")
  if (auth instanceof Response) return auth

  const [tickets, commits] = await Promise.all([
    ticketsForWorkspace(workspaceId!),
    commitsForWorkspace(workspaceId!),
  ])
  const since = Date.now() - 86_400_000
  const recentCommits = (commits as GitCommit[]).filter((c) => new Date(c.date).getTime() >= since)
  const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS")
  const inReview = tickets.filter((t) => t.status === "IN_REVIEW")
  const blocked = tickets.filter((t) => t.priority === "CRITICAL" && t.status !== "DONE")
  const doneRecently = tickets.filter(
    (t) => t.status === "DONE" && Date.now() - new Date(t.updatedAt).getTime() <= 86_400_000
  )

  const content = [
    `Commits (24h): ${recentCommits.length}`,
    ...recentCommits.slice(0, 15).map((c) => `- ${c.message}`),
    `\nDone recently:`,
    ...doneRecently.map((t) => `- ${t.shortId} ${t.title}`),
    `\nIn progress / review:`,
    ...[...inProgress, ...inReview].map((t) => `- [${STATUS_LABELS[t.status]}] ${t.shortId} ${t.title}`),
    `\nCritical/blocked:`,
    ...blocked.map((t) => `- ${t.shortId} ${t.title}`),
  ].join("\n")

  try {
    const digest = await withAi(auth, "standup", () => standupDigest(content), { workspaceId })
    return Response.json({ digest })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: "Standup failed" }, { status: 502 })
  }
}
