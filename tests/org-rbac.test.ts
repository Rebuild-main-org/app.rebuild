import { describe, it, expect } from "vitest"
import { orgCan, capabilitiesFor } from "@/lib/org-rbac"

describe("orgCan", () => {
  it("owner is an org superuser", () => {
    expect(orgCan("owner", "org.manage")).toBe(true)
    expect(orgCan("owner", "billing.manage")).toBe(true)
    expect(orgCan("owner", "code.access")).toBe(true)
  })

  it("admin manages projects/crm/support + code access, but NOT billing/org", () => {
    expect(orgCan("admin", "project.manage")).toBe(true)
    expect(orgCan("admin", "code.access")).toBe(true)
    expect(orgCan("admin", "billing.manage")).toBe(false)
    expect(orgCan("admin", "org.manage")).toBe(false)
  })

  it("member is read-only and has NO code access by default", () => {
    expect(orgCan("member", "project.view")).toBe(true)
    expect(orgCan("member", "project.manage")).toBe(false)
    expect(orgCan("member", "code.access")).toBe(false)
  })

  it("guest is portal-only", () => {
    expect(orgCan("guest", "portal.only")).toBe(true)
    expect(orgCan("guest", "project.view")).toBe(false)
  })
})

describe("capabilitiesFor", () => {
  it("owner gets org.manage + billing.manage and not portal.only", () => {
    const caps = capabilitiesFor("owner")
    expect(caps).toContain("org.manage")
    expect(caps).toContain("billing.manage")
    expect(caps).not.toContain("portal.only")
  })

  it("guest gets only portal.only", () => {
    expect(capabilitiesFor("guest")).toEqual(["portal.only"])
  })
})
