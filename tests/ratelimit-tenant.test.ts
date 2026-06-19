import { describe, it, expect } from "vitest"
import { tenantKey, rateLimitAsync, rateLimitResponseAsync } from "@/lib/ratelimit"

// Upstash is unset in tests, so rateLimitAsync uses the in-process fallback.
describe("tenantKey", () => {
  it("namespaces a route under the org", () => {
    expect(tenantKey("org-A", "ai.chat")).toBe("org:org-A:ai.chat")
  })
})

describe("rateLimitAsync (in-process fallback)", () => {
  it("allows up to the limit then blocks", async () => {
    const key = tenantKey(`o${Math.random()}`, "x")
    expect((await rateLimitAsync(key, 2, 1000)).ok).toBe(true)
    expect((await rateLimitAsync(key, 2, 1000)).ok).toBe(true)
    expect((await rateLimitAsync(key, 2, 1000)).ok).toBe(false)
  })

  it("isolates distinct tenants", async () => {
    const a = tenantKey(`a${Math.random()}`, "x")
    const b = tenantKey(`b${Math.random()}`, "x")
    await rateLimitAsync(a, 1, 1000)
    expect((await rateLimitAsync(a, 1, 1000)).ok).toBe(false)
    expect((await rateLimitAsync(b, 1, 1000)).ok).toBe(true) // different org unaffected
  })

  it("rateLimitResponseAsync returns a 429 once over the limit", async () => {
    const key = tenantKey(`r${Math.random()}`, "x")
    expect(await rateLimitResponseAsync(key, 1, 1000)).toBeNull()
    const res = await rateLimitResponseAsync(key, 1, 1000)
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(429)
  })
})
