import { getSessionUser } from "@/lib/auth/session"
import { createOrgForUser, type OrgTemplate } from "@/lib/onboarding"

export const dynamic = "force-dynamic"

// POST /api/orgs — self-serve org creation (signup wizard). The caller becomes
// the org owner; a setup checklist is seeded so the app is never empty.
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { name, template } = (await request.json().catch(() => ({}))) as {
    name?: string
    template?: OrgTemplate
  }
  if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 })
  const orgId = await createOrgForUser({ userId: user.id, name: name.trim(), template })
  return Response.json({ orgId }, { status: 201 })
}
