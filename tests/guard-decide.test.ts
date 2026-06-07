import { describe, it, expect } from "vitest"
import { decideWorkspaceAccess, effectiveWorkspaceRole } from "@/lib/auth/decide"

describe("effectiveWorkspaceRole", () => {
  it("ADMIN is always ADMIN regardless of membership", () => {
    expect(effectiveWorkspaceRole("ADMIN", null)).toBe("ADMIN")
    expect(effectiveWorkspaceRole("ADMIN", "CLIENT")).toBe("ADMIN")
  })
  it("non-admin uses the workspace membership role", () => {
    expect(effectiveWorkspaceRole("ENGINEER", "LEAD")).toBe("LEAD")
    expect(effectiveWorkspaceRole("LEAD", "ENGINEER")).toBe("ENGINEER")
  })
  it("non-admin non-member is null", () => {
    expect(effectiveWorkspaceRole("ENGINEER", null)).toBeNull()
  })
})

describe("decideWorkspaceAccess (the anti-IDOR guard verdict)", () => {
  it("rejects unauthenticated", () => {
    expect(decideWorkspaceAccess({ user: null, workspaceId: "w1", memberRole: null })).toBe("unauthenticated")
  })
  it("rejects missing workspace", () => {
    expect(decideWorkspaceAccess({ user: { role: "ADMIN" }, workspaceId: null, memberRole: null })).toBe("not-found")
  })
  it("ADMIN bypasses membership", () => {
    expect(decideWorkspaceAccess({ user: { role: "ADMIN" }, workspaceId: "w1", memberRole: null })).toBe("ok")
  })
  it("non-member is forbidden", () => {
    expect(decideWorkspaceAccess({ user: { role: "ENGINEER" }, workspaceId: "w1", memberRole: null })).toBe("forbidden-membership")
  })
  it("member without the required action is forbidden", () => {
    // CLIENT member cannot access code.
    expect(
      decideWorkspaceAccess({ user: { role: "ENGINEER" }, workspaceId: "w1", memberRole: "CLIENT", action: "code.access" })
    ).toBe("forbidden-action")
  })
  it("member with the required workspace role is allowed (per-workspace permissions)", () => {
    // Global ENGINEER but LEAD in this workspace → can merge here.
    expect(
      decideWorkspaceAccess({ user: { role: "ENGINEER" }, workspaceId: "w1", memberRole: "LEAD", action: "pr.merge" })
    ).toBe("ok")
  })
  it("global LEAD demoted to ENGINEER in a workspace cannot merge there", () => {
    expect(
      decideWorkspaceAccess({ user: { role: "LEAD" }, workspaceId: "w1", memberRole: "ENGINEER", action: "pr.merge" })
    ).toBe("forbidden-action")
  })
  it("member with no action requirement is allowed", () => {
    expect(decideWorkspaceAccess({ user: { role: "ENGINEER" }, workspaceId: "w1", memberRole: "ENGINEER" })).toBe("ok")
  })
})
