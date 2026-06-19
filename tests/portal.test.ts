import { describe, it, expect, beforeAll } from "vitest"

beforeAll(() => {
  process.env.CLIENT_PORTAL_SECRET = "portal-secret-distinct-1234567890"
})

import { signPortalToken, verifyPortalToken } from "@/lib/portal"

describe("client-portal tokens", () => {
  it("signs and verifies a workspace id", () => {
    const t = signPortalToken("ws-123")
    expect(verifyPortalToken(t)).toBe("ws-123")
  })

  it("rejects a tampered signature", () => {
    const t = signPortalToken("ws-123")
    expect(verifyPortalToken(t.slice(0, -2) + "xy")).toBeNull()
  })

  it("rejects an expired token", () => {
    const expired = signPortalToken("ws-123", -1) // already past
    expect(verifyPortalToken(expired)).toBeNull()
  })

  it("rejects a malformed token", () => {
    expect(verifyPortalToken("garbage")).toBeNull()
    expect(verifyPortalToken("a.b")).toBeNull()
  })
})
