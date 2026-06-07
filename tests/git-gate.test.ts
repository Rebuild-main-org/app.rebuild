import { describe, it, expect } from "vitest"
import { evaluateApprovalGate, latestReviewStates } from "@/lib/git-gate"

describe("latestReviewStates", () => {
  it("keeps the latest state per reviewer (input ordered oldest→newest)", () => {
    const states = latestReviewStates([
      { reviewer_id: "a", state: "CHANGES_REQUESTED" },
      { reviewer_id: "b", state: "COMMENTED" },
      { reviewer_id: "a", state: "APPROVED" }, // a changed their mind
    ])
    expect(states.sort()).toEqual(["APPROVED", "COMMENTED"])
  })
})

describe("evaluateApprovalGate (merge gate)", () => {
  it("blocks when no approving review", () => {
    expect(evaluateApprovalGate(["COMMENTED"], true).ok).toBe(false)
    expect(evaluateApprovalGate([], true).ok).toBe(false)
  })
  it("blocks when changes are requested even if also approved", () => {
    const r = evaluateApprovalGate(["APPROVED", "CHANGES_REQUESTED"], true)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/changes requested/i)
  })
  it("allows with at least one approval and no changes requested", () => {
    expect(evaluateApprovalGate(["APPROVED"], true).ok).toBe(true)
    expect(evaluateApprovalGate(["APPROVED", "COMMENTED"], true).ok).toBe(true)
  })
  it("requires_approval=false bypasses the gate entirely", () => {
    expect(evaluateApprovalGate([], false).ok).toBe(true)
    expect(evaluateApprovalGate(["CHANGES_REQUESTED"], false).ok).toBe(true)
  })
})
