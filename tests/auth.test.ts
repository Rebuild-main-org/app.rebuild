import { describe, it, expect } from "vitest"
import { can, roleAtLeast } from "@/lib/auth"
import { ALL_ROLES } from "@/lib/types"

describe("can() RBAC matrix", () => {
  it("only ADMIN (and the SUPER_ADMIN superuser) can create workspaces", () => {
    expect(can({ role: "ADMIN" }, "workspace.create")).toBe(true)
    for (const r of ALL_ROLES.filter((x) => x !== "ADMIN" && x !== "SUPER_ADMIN"))
      expect(can({ role: r }, "workspace.create")).toBe(false)
  })

  it("SUPER_ADMIN is an unrestricted superuser", () => {
    expect(can({ role: "SUPER_ADMIN" }, "workspace.create")).toBe(true)
    expect(can({ role: "SUPER_ADMIN" }, "support.resolve")).toBe(true)
    expect(can({ role: "SUPER_ADMIN" }, "notify.broadcast")).toBe(true)
    // and the resolve gate excludes plain ADMIN
    expect(can({ role: "ADMIN" }, "support.resolve")).toBe(false)
  })

  it("clients cannot access code or use copilot", () => {
    expect(can({ role: "CLIENT" }, "code.access")).toBe(false)
    expect(can({ role: "CLIENT" }, "copilot.use")).toBe(false)
  })

  it("only ADMIN and FINANCE manage billing", () => {
    expect(can({ role: "FINANCE" }, "billing.manage")).toBe(true)
    expect(can({ role: "ADMIN" }, "billing.manage")).toBe(true)
    expect(can({ role: "ENGINEER" }, "billing.manage")).toBe(false)
  })

  it("undefined user is denied everything", () => {
    expect(can(undefined, "workspace.edit")).toBe(false)
  })

  it("merge is restricted to ADMIN and LEAD", () => {
    expect(can({ role: "LEAD" }, "pr.merge")).toBe(true)
    expect(can({ role: "ENGINEER" }, "pr.merge")).toBe(false)
  })
})

describe("roleAtLeast tiers", () => {
  it("ADMIN outranks LEAD outranks ENGINEER outranks CLIENT", () => {
    expect(roleAtLeast("ADMIN", "LEAD")).toBe(true)
    expect(roleAtLeast("LEAD", "ENGINEER")).toBe(true)
    expect(roleAtLeast("ENGINEER", "CLIENT")).toBe(true)
  })

  it("PM sits at the LEAD tier", () => {
    expect(roleAtLeast("PM", "LEAD")).toBe(true)
  })

  it("ENGINEER is not at the LEAD tier", () => {
    expect(roleAtLeast("ENGINEER", "LEAD")).toBe(false)
  })

  it("CLIENT is below every staff role", () => {
    for (const r of ALL_ROLES.filter((x) => x !== "CLIENT"))
      expect(roleAtLeast("CLIENT", r)).toBe(false)
  })
})
