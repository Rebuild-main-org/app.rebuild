import "server-only"

import { sb } from "@/lib/data"
import { ALL_ROLES, type Role } from "@/lib/types"

// Sections whose access the super-admin can grant per role (matches the nav).
export const SECTIONS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "workspaces", label: "Workspaces", href: "/workspaces" },
  { key: "crm", label: "CRM", href: "/crm" },
  { key: "support", label: "Support", href: "/support" },
  { key: "analytics", label: "Analytics", href: "/analytics" },
  { key: "reports", label: "Reports", href: "/reports" },
] as const

export type SectionKey = (typeof SECTIONS)[number]["key"]
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as SectionKey[]

// Defaults mirror the previous static RBAC. SUPER_ADMIN always has everything.
const DEFAULTS: Record<SectionKey, Role[]> = {
  dashboard: [...ALL_ROLES],
  workspaces: [...ALL_ROLES],
  crm: ["ADMIN", "LEAD", "PM", "SALES"],
  support: [...ALL_ROLES],
  analytics: ["ADMIN", "LEAD", "PM"],
  reports: ["ADMIN", "LEAD", "PM"],
}

function defaultAllowed(section: SectionKey, role: Role): boolean {
  if (role === "SUPER_ADMIN") return true
  return DEFAULTS[section].includes(role)
}

// Full matrix (section → role → allowed), defaults merged with DB overrides.
export async function permissionMatrix(): Promise<Record<SectionKey, Record<Role, boolean>>> {
  const { data } = await sb().from("section_permissions").select("section,role,allowed")
  const overrides = new Map((data ?? []).map((r) => [`${r.section}:${r.role}`, r.allowed as boolean]))
  const matrix = {} as Record<SectionKey, Record<Role, boolean>>
  for (const { key } of SECTIONS) {
    matrix[key] = {} as Record<Role, boolean>
    for (const role of ALL_ROLES) {
      const o = overrides.get(`${key}:${role}`)
      matrix[key][role] = role === "SUPER_ADMIN" ? true : o ?? defaultAllowed(key, role)
    }
  }
  return matrix
}

// Whether a role may access one section (used to gate both nav and the page).
export async function canAccessSection(role: Role, section: SectionKey): Promise<boolean> {
  if (role === "SUPER_ADMIN") return true
  const { data } = await sb()
    .from("section_permissions")
    .select("allowed")
    .eq("role", role)
    .eq("section", section)
    .maybeSingle()
  return (data?.allowed as boolean | undefined) ?? defaultAllowed(section, role)
}

// Section keys a given role may access (used to gate the nav).
export async function sectionsAllowedFor(role: Role): Promise<SectionKey[]> {
  if (role === "SUPER_ADMIN") return [...SECTION_KEYS]
  const { data } = await sb().from("section_permissions").select("section,role,allowed").eq("role", role)
  const overrides = new Map((data ?? []).map((r) => [r.section as string, r.allowed as boolean]))
  return SECTION_KEYS.filter((k) => overrides.get(k) ?? defaultAllowed(k, role))
}
