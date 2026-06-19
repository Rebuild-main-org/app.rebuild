// Onboarding (Phase 4) — create an org for a self-serve signup and seed its
// setup checklist, so the app is never empty and progress is tracked.

import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

export type OrgTemplate = "dev-solo" | "agency" | "studio" | "mixed"

export const DEFAULT_CHECKLIST: Record<string, boolean> = {
  connect_ai: false,
  create_project: false,
  invite_member: false,
  invite_client: false,
  customize_portal: false,
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org"
  )
}

// Create an org, make the user its owner, seed setup state. Returns the org id.
export async function createOrgForUser(args: {
  userId: string
  name: string
  template?: OrgTemplate
}): Promise<string> {
  const admin = supabaseAdmin()

  let slug = slugify(args.name)
  const { data: clash } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle()
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: args.name, slug, template: args.template ?? "mixed" })
    .select("id")
    .single()
  if (error || !org) throw new Error(error?.message ?? "org create failed")
  const orgId = org.id as string

  await admin.from("organization_members").insert({ org_id: orgId, user_id: args.userId, role: "owner" })
  await admin.from("org_setup_state").insert({ org_id: orgId, checklist: DEFAULT_CHECKLIST })
  return orgId
}
