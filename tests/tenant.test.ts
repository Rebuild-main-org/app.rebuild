import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the two collaborators so we can unit-test the resolver logic without a
// live Supabase / Next request context.
const getSessionUser = vi.fn()
const maybeSingle = vi.fn()

vi.mock("@/lib/auth/session", () => ({ getSessionUser: () => getSessionUser() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: () => maybeSingle() }),
          }),
        }),
      }),
    }),
  }),
}))

import { getTenant, requireTenant } from "@/lib/tenant"

beforeEach(() => {
  getSessionUser.mockReset()
  maybeSingle.mockReset()
})

describe("getTenant", () => {
  it("returns null when there is no session", async () => {
    getSessionUser.mockResolvedValue(null)
    expect(await getTenant()).toBeNull()
  })

  it("returns null when the user belongs to no organization", async () => {
    getSessionUser.mockResolvedValue({ id: "u1" })
    maybeSingle.mockResolvedValue({ data: null })
    expect(await getTenant()).toBeNull()
  })

  it("maps a membership row to the tenant context", async () => {
    getSessionUser.mockResolvedValue({ id: "u1" })
    maybeSingle.mockResolvedValue({ data: { org_id: "org-A", role: "owner" } })
    expect(await getTenant()).toEqual({ orgId: "org-A", role: "owner", userId: "u1" })
  })
})

describe("requireTenant", () => {
  it("returns a 403 Response when there is no tenant", async () => {
    getSessionUser.mockResolvedValue(null)
    const res = await requireTenant()
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(403)
  })

  it("returns the tenant context when present", async () => {
    getSessionUser.mockResolvedValue({ id: "u2" })
    maybeSingle.mockResolvedValue({ data: { org_id: "org-B", role: "member" } })
    const res = await requireTenant()
    expect(res).not.toBeInstanceOf(Response)
    expect(res).toMatchObject({ orgId: "org-B", role: "member", userId: "u2" })
  })
})
