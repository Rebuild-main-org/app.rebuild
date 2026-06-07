import { describe, it, expect } from "vitest"
import { nextTicketNumberFromShortIds } from "@/lib/ticket-number"

describe("nextTicketNumberFromShortIds (atomic-fallback allocator)", () => {
  it("starts at 101 for an empty project", () => {
    expect(nextTicketNumberFromShortIds([])).toBe(101)
  })
  it("returns max+1 from existing keys", () => {
    expect(nextTicketNumberFromShortIds(["ACME-101", "ACME-103", "ACME-102"])).toBe(104)
  })
  it("ignores malformed ids", () => {
    expect(nextTicketNumberFromShortIds(["ACME-", "ACME-x", "ACME-105"])).toBe(106)
  })
  it("respects a custom base", () => {
    expect(nextTicketNumberFromShortIds([], 0)).toBe(1)
  })
})
