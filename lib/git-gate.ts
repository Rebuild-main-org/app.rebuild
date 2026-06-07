// Pure PR merge-gate logic (GitHub branch-protection style), unit-testable
// independently of the route IO.

export interface ReviewRow {
  reviewer_id: string
  state: string // APPROVED | CHANGES_REQUESTED | COMMENTED
}

// Collapse a chronologically-ordered list of reviews to the latest state per
// reviewer. (Input must be ordered oldest → newest.)
export function latestReviewStates(reviews: ReviewRow[]): string[] {
  const byReviewer = new Map<string, string>()
  for (const r of reviews) byReviewer.set(r.reviewer_id, r.state)
  return [...byReviewer.values()]
}

// Decide whether a PR may merge given the latest review states.
export function evaluateApprovalGate(
  latestStates: string[],
  requiresApproval: boolean
): { ok: boolean; reason?: string } {
  if (!requiresApproval) return { ok: true }
  if (latestStates.includes("CHANGES_REQUESTED")) {
    return { ok: false, reason: "Changes requested — resolve reviews before merging" }
  }
  if (!latestStates.includes("APPROVED")) {
    return { ok: false, reason: "At least one approving review is required" }
  }
  return { ok: true }
}
