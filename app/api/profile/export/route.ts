import { requireAuth } from "@/lib/auth/guard"
import { SEL, getPreferences, sb } from "@/lib/data"

// GET /api/profile/export — GDPR data export (right of access). Returns all
// data tied to the signed-in user as a downloadable JSON file.
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const uid = auth.id

  const [profile, prefs, reported, assigned, comments, timeEntries, memberships] =
    await Promise.all([
      sb().from("users").select(SEL.user).eq("id", uid).maybeSingle(),
      getPreferences(uid),
      sb().from("tickets").select(SEL.ticket).eq("reporter_id", uid),
      sb().from("tickets").select(SEL.ticket).eq("assignee_id", uid),
      sb().from("comments").select(SEL.comment).eq("author_id", uid),
      sb().from("time_entries").select(SEL.timeEntry).eq("user_id", uid),
      sb().from("workspace_members").select(SEL.member).eq("user_id", uid),
    ])

  const payload = {
    exportedAt: new Date().toISOString(),
    user: { id: uid, email: auth.email, name: auth.name, role: auth.role },
    profile: profile.data ?? null,
    preferences: prefs,
    ticketsReported: reported.data ?? [],
    ticketsAssigned: assigned.data ?? [],
    comments: comments.data ?? [],
    timeEntries: timeEntries.data ?? [],
    workspaceMemberships: memberships.data ?? [],
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rebuild-data-export.json"`,
    },
  })
}
