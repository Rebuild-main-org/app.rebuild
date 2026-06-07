import { describe, it, expect } from "vitest"
import { computeDora } from "@/lib/dora"

const NOW = Date.parse("2026-02-01T00:00:00Z")
const days = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

describe("computeDora", () => {
  it("counts deploys and frequency in the window", () => {
    const m = computeDora([], [{ status: "SUCCESS", deployedAt: days(1) }, { status: "SUCCESS", deployedAt: days(2) }], 14, NOW)
    expect(m.deployCount).toBe(2)
    expect(m.deploysPerWeek).toBe(1) // 2 over 2 weeks
  })

  it("computes change failure rate over terminal deploys", () => {
    const m = computeDora([], [
      { status: "SUCCESS", deployedAt: days(1) },
      { status: "FAILED", deployedAt: days(2) },
      { status: "IN_PROGRESS", deployedAt: days(3) },
    ], 30, NOW)
    expect(m.changeFailureRate).toBe(0.5) // 1 failed / 2 terminal
  })

  it("computes lead time from latest commit before a success", () => {
    const m = computeDora(
      [{ date: days(3) }],
      [{ status: "SUCCESS", deployedAt: days(1) }], // 2 days = 48h after the commit
      30,
      NOW
    )
    expect(m.leadTimeHours).toBe(48)
  })

  it("computes MTTR from failed → next success", () => {
    const m = computeDora([], [
      { status: "FAILED", deployedAt: days(2) },
      { status: "SUCCESS", deployedAt: days(1) }, // 1 day = 24h later
    ], 30, NOW)
    expect(m.mttrHours).toBe(24)
  })

  it("excludes deploys outside the window", () => {
    const m = computeDora([], [{ status: "SUCCESS", deployedAt: days(200) }], 90, NOW)
    expect(m.deployCount).toBe(0)
  })
})
