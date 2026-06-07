import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { emit } from "@/lib/events"
import { createNotification } from "@/lib/mutations"
import type { PRComment, PRReview, ReviewState } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"

const STATES: ReviewState[] = ["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]

async function prByNumber(wsId: string, number: number) {
  const { data } = await sb().from("pull_requests").select(SEL.pr).eq("workspace_id", wsId).eq("number", number).maybeSingle()
  return data
}

// GET — reviews + comments for a PR (with author names).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string; number: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { wsId, number } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const pr = await prByNumber(wsId, Number(number))
  if (!pr) return Response.json({ error: "Not found" }, { status: 404 })

  const [{ data: reviews }, { data: comments }, users] = await Promise.all([
    sb().from("pr_reviews").select(SEL.prReview).eq("pr_id", pr.id).order("created_at"),
    sb().from("pr_comments").select(SEL.prComment).eq("pr_id", pr.id).order("created_at"),
    getUsersMap(),
  ])
  return Response.json({
    reviews: ((reviews ?? []) as PRReview[]).map((r) => ({ ...r, reviewer: users.get(r.reviewerId) })),
    comments: ((comments ?? []) as PRComment[]).map((c) => ({ ...c, author: users.get(c.authorId) })),
  })
}

// POST — submit a review (approve / request changes / comment).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; number: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "pr.approve")) return Response.json({ error: "Forbidden" }, { status: 403 })
  const { wsId, number } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const pr = await prByNumber(wsId, Number(number))
  if (!pr) return Response.json({ error: "Not found" }, { status: 404 })

  const { state, body } = (await request.json()) as { state?: ReviewState; body?: string }
  if (!STATES.includes(state as ReviewState)) {
    return Response.json({ error: "Invalid review state" }, { status: 400 })
  }
  const review = {
    id: randomUUID(),
    pr_id: pr.id,
    reviewer_id: user.id,
    state,
    body: body?.trim() || null,
    created_at: new Date().toISOString(),
  }
  const { error } = await sb().from("pr_reviews").insert(review)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  emit(`ws:${wsId}`, "pr.updated", { pr }, user.id)
  if (pr.authorId && pr.authorId !== user.id) {
    await createNotification(
      pr.authorId,
      "pr_review",
      `${user.name} ${state === "APPROVED" ? "approved" : state === "CHANGES_REQUESTED" ? "requested changes on" : "commented on"} PR #${pr.number}`,
      `/workspace/${wsId}/git`
    )
  }
  return Response.json({ ok: true }, { status: 201 })
}
