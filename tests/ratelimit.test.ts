import { describe, it, expect } from "vitest"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `t:${Math.random()}`
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    const blocked = rateLimit(key, 3, 1000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it("isolates distinct keys", () => {
    const a = `a:${Math.random()}`
    const b = `b:${Math.random()}`
    rateLimit(a, 1, 1000)
    expect(rateLimit(a, 1, 1000).ok).toBe(false)
    expect(rateLimit(b, 1, 1000).ok).toBe(true)
  })

  it("resets after the window elapses", async () => {
    const key = `w:${Math.random()}`
    expect(rateLimit(key, 1, 50).ok).toBe(true)
    expect(rateLimit(key, 1, 50).ok).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(rateLimit(key, 1, 50).ok).toBe(true)
  })

  it("rateLimitResponse returns a 429 once over the limit", () => {
    const key = `r:${Math.random()}`
    expect(rateLimitResponse(key, 1, 1000)).toBeNull()
    const res = rateLimitResponse(key, 1, 1000)
    expect(res).toBeInstanceOf(Response)
    expect(res?.status).toBe(429)
  })
})
