import { randomUUID } from "crypto"

import { fetchSupportTickets, getUsersMap, sb } from "@/lib/data"
import { requireAuth } from "@/lib/auth/guard"
import { requireTenant } from "@/lib/tenant"
import { can } from "@/lib/auth"
import { createNotification } from "@/lib/mutations"
import { ghCreateIssue, supportRepo } from "@/lib/github"
import { appUrl } from "@/lib/email"
import { reportType } from "@/lib/support"
import { SLA_HOURS, type SupportStatus, type TicketPriority } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/support?status= — staff (support.view) see the whole queue; every
// other authenticated user sees only the tickets they opened.
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const status = new URL(request.url).searchParams.get("status")
  const [data, users] = await Promise.all([
    fetchSupportTickets({
      isStaff: can(auth, "support.view"),
      ownerId: auth.id,
      ownerEmail: auth.email,
      status,
    }),
    getUsersMap(),
  ])
  return Response.json(
    data.map((t) => ({ ...t, assignee: users.get(t.assigneeId as string)?.name }))
  )
}

// POST /api/support — any authenticated user can open a ticket. Super-admins are
// notified so they can handle it.
export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const tenant = await requireTenant()
  if (tenant instanceof Response) return tenant
  const { subject, body, priority, workspaceId, reportType: reportTypeRaw } = (await request.json()) as {
    subject?: string
    body?: string
    priority?: TicketPriority
    workspaceId?: string
    reportType?: string
  }
  if (!subject?.trim()) {
    return Response.json({ error: "subject is required" }, { status: 400 })
  }
  const rt = reportType(reportTypeRaw) // resolves to a known type (default: bug)
  const typeTag = rt.value.charAt(0).toUpperCase() + rt.value.slice(1)
  const prio = priority ?? "MEDIUM"
  const slaDue = new Date(Date.now() + SLA_HOURS[prio] * 3_600_000).toISOString()
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    org_id: tenant.orgId, // tenant stamp; read path (fetchSupportTickets) still
    // uses service-role + owner/staff scoping — convert to RLS in a later slice.
    subject: subject.trim(),
    body: body ?? "",
    requester_email: auth.email,
    requester_id: auth.id,
    status: "NEW" as SupportStatus,
    priority: prio,
    workspace_id: workspaceId ?? null,
    assignee_id: null,
    sla_due_at: slaDue,
    created_at: now,
    updated_at: now,
  }
  const { error } = await sb().from("support_tickets").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  // Best-effort: open a GitHub issue in the support repo so tickets are triaged
  // alongside engineering work. A GitHub outage never blocks ticket creation.
  let githubIssueNumber: number | undefined
  let githubIssueUrl: string | undefined
  const issue = await ghCreateIssue(supportRepo(), {
    title: `[Support · ${typeTag}] ${row.subject}`,
    body: [
      row.body || "_No description provided._",
      "",
      "---",
      `- **Type:** ${rt.label}`,
      `- **Requester:** ${row.requester_email}`,
      `- **Priority:** ${prio}`,
      row.workspace_id ? `- **Workspace:** \`${row.workspace_id}\`` : null,
      `- **Ticket:** ${appUrl(`/support?ticket=${row.id}`)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    labels: ["support", ...rt.ghLabels],
  })
  if (issue) {
    githubIssueNumber = issue.number
    githubIssueUrl = issue.url
    await sb()
      .from("support_tickets")
      .update({ github_issue_number: issue.number, github_issue_url: issue.url })
      .eq("id", row.id)
  }

  // Notify super-admins that a ticket needs handling.
  const { data: admins } = await sb().from("users").select("id").eq("role", "SUPER_ADMIN")
  for (const a of admins ?? []) {
    if (a.id === auth.id) continue
    await createNotification(
      a.id as string,
      "support_opened",
      `New support ticket: ${row.subject}`,
      `/support?ticket=${row.id}`
    )
  }
  return Response.json(
    { ...row, github_issue_number: githubIssueNumber, github_issue_url: githubIssueUrl },
    { status: 201 }
  )
}

// DELETE /api/support { ids: string[] } | { all: true } — bulk delete tickets
// (SUPER_ADMIN only). Cascades to comments.
export async function DELETE(request: Request) {
  const auth = await requireAuth("support.resolve")
  if (auth instanceof Response) return auth
  const { ids, all } = (await request.json().catch(() => ({}))) as { ids?: string[]; all?: boolean }
  let q = sb().from("support_tickets").delete()
  if (all) {
    q = q.neq("id", "")
  } else {
    const list = (ids ?? []).filter(Boolean)
    if (list.length === 0) return Response.json({ error: "ids or all required" }, { status: 400 })
    q = q.in("id", list)
  }
  const { error } = await q
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ ok: true })
}
