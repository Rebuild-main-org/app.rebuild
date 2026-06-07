import { describe, it, expect } from "vitest"
import { parsePage, pageRange, paged } from "@/lib/pagination"

const u = (qs: string) => `https://x.test/api?${qs}`

describe("parsePage", () => {
  it("defaults when no params", () => {
    expect(parsePage(u(""))).toEqual({ limit: 50, offset: 0 })
  })
  it("reads limit and offset", () => {
    expect(parsePage(u("limit=20&offset=40"))).toEqual({ limit: 20, offset: 40 })
  })
  it("caps limit at max", () => {
    expect(parsePage(u("limit=9999"), 50, 100).limit).toBe(100)
  })
  it("clamps invalid/negative values", () => {
    expect(parsePage(u("limit=-5&offset=-9"))).toEqual({ limit: 50, offset: 0 })
    expect(parsePage(u("limit=abc"))).toEqual({ limit: 50, offset: 0 })
  })
})

describe("pageRange", () => {
  it("computes inclusive bounds", () => {
    expect(pageRange({ limit: 25, offset: 50 })).toEqual([50, 74])
  })
})

describe("paged", () => {
  it("sets nextOffset when a full page is returned", () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    expect(paged(items, { limit: 10, offset: 0 }).nextOffset).toBe(10)
  })
  it("nextOffset is null on a partial page (end)", () => {
    expect(paged([1, 2], { limit: 10, offset: 0 }).nextOffset).toBeNull()
  })
})
