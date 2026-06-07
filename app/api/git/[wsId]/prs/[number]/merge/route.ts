import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import { emit } from "@/lib/events"
import { createNotification } from "@/lib/mutations"
import type { PullRequest, Ticket } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"
import { getWorkspace } from "@/lib/queries"
import { ghMergePR, githubEnabled, syncPullRequests } from "@/lib/github"
import { evaluateApprovalGate, latestReviewStates } from "@/lib/git-gate"

// POST /api/git/:wsId/prs/:number/merge — merge a PR. ADMIN/LEAD only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; number: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "pr.merge")) {
    return Response.json({ error: "Only leads and admins can merge pull requests" }, { status: 403 })
  }
  const { wsId, number } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access

  // Fix B: in GitHub mode, mirror live PRs first so the row exists by number.
  const ws = await getWorkspace(wsId)
  if (githubEnabled() && ws) await syncPullRequests(wsId, ws.githubRepo)

  const { data: prRow } = await sb()
    .from("pull_requests")
    .select(SEL.pr)
    .eq("workspace_id", wsId)
    .eq("number", Number(number))
    .maybeSingle()
  const pr = prRow as PullRequest | null
  if (!pr) return Response.json({ error: "Not found" }, { status: 404 })
  if (pr.status === "MERGED") return Response.json({ error: "Already merged" }, { status: 409 })
  if (pr.ci === "FAILING") return Response.json({ error: "Cannot merge while CI is failing" }, { status: 409 })
  if (pr.ci === "RUNNING") return Response.json({ error: "CI is still running — wait for it to finish" }, { status: 409 })

  // Fix H: honour the per-PR `requires_approval` flag (default true).
  const { data: cfg } = await sb()
    .from("pull_requests")
    .select("requires_approval")
    .eq("id", pr.id)
    .maybeSingle()
  const requireApproval = cfg?.requires_approval !== false

  // Required-approval gate (GitHub branch-protection style): latest review per
  // reviewer must include an approval and no outstanding "changes requested".
  {
    const { data: reviews } = await sb()
      .from("pr_reviews")
      .select("reviewer_id,state,created_at")
      .eq("pr_id", pr.id)
      .order("created_at")
    const states = latestReviewStates(
      ((reviews ?? []) as { reviewer_id: string; state: string }[]).map((r) => ({
        reviewer_id: r.reviewer_id,
        state: r.state,
      }))
    )
    const gate = evaluateApprovalGate(states, requireApproval)
    if (!gate.ok) return Response.json({ error: gate.reason }, { status: 409 })
  }

  const { strategy } = (await request.json().catch(() => ({}))) as {
    strategy?: "merge" | "squash" | "rebase"
  }

  // Fix B: when GitHub is connected, merge for real via the API.
  if (githubEnabled() && ws) {
    try {
      await ghMergePR(ws.githubRepo, Number(number), strategy ?? "squash")
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "GitHub merge failed" },
        { status: 502 }
      )
    }
  }

  await sb().from("pull_requests").update({ status: "MERGED" }).eq("id", pr.id)
  pr.status = "MERGED"
  emit(`ws:${wsId}`, "pr.updated", { pr }, user.id)

  if (pr.ticketId) {
    const { data: tRow } = await sb().from("tickets").select(SEL.ticket).eq("id", pr.ticketId).maybeSingle()
    const ticket = tRow as Ticket | null
    if (ticket && ticket.status !== "DONE") {
      await sb().from("tickets").update({ status: "DONE", updated_at: new Date().toISOString() }).eq("id", ticket.id)
      ticket.status = "DONE"
      emit([`ticket:${ticket.id}`, `project:${ticket.projectId}`, `ws:${wsId}`], "ticket.updated", { ticket }, user.id)
      if (ticket.assigneeId) {
        await createNotification(
          ticket.assigneeId,
          "status_changed",
          `${ticket.shortId} moved to Done (PR #${pr.number} merged)`,
          `/workspace/${wsId}/git`
        )
      }
    }
  }
  return Response.json({ pr, strategy: strategy ?? "merge" })
}
