// Async write operations against Supabase, with activity + notification +
// realtime side-effects. Server-only (service-role).

import "server-only"
import { randomUUID } from "crypto"
import { nextTicketNumberFromShortIds } from "./ticket-number"

import { SEL, sb } from "./data"
import { emit } from "./events"
import { getSessionUser } from "./auth/session"
import { emailEnabled, sendEmail, layout, appUrl } from "./email"
import { notifySlack, slackEnabled } from "./slack"
import type {
  ActivityKind,
  Branch,
  Comment,
  GitCommit,
  Notification,
  Project,
  ProjectStatus,
  RepoFile,
  Ticket,
  TicketPriority,
  TimeEntry,
  TicketStatus,
  TicketType,
  StoryPoints,
} from "./types"

async function actorId(): Promise<string> {
  const u = await getSessionUser()
  if (!u) throw new Error("Not authenticated")
  return u.id
}

async function workspaceRoomsForProject(projectId: string): Promise<string[]> {
  const { data } = await sb().from("projects").select("workspace_id").eq("id", projectId).maybeSingle()
  return ["project:" + projectId, ...(data ? ["ws:" + data.workspace_id] : [])]
}

// Deep link that opens the specific ticket on its board (?ticket=<id>).
async function ticketLink(t: { id: string; projectId: string }): Promise<string> {
  const { data } = await sb().from("projects").select("workspace_id").eq("id", t.projectId).maybeSingle()
  return data
    ? `/workspace/${data.workspace_id}/projects/${t.projectId}/board?ticket=${t.id}`
    : "/dashboard"
}

async function logActivity(ticketId: string, kind: ActivityKind, message: string, actor?: string) {
  const actorUid = actor ?? (await actorId())
  await sb().from("activities").insert({
    id: randomUUID(),
    ticket_id: ticketId,
    kind,
    actor_id: actorUid,
    message,
    created_at: new Date().toISOString(),
  })
}

export async function audit(action: string, entityType: string, entityId: string, actor?: string) {
  try {
    await sb().from("audit_logs").insert({
      id: randomUUID(),
      action,
      entity_type: entityType,
      entity_id: entityId,
      user_id: actor ?? null,
      created_at: new Date().toISOString(),
    })
  } catch {
    // audit is best-effort
  }
}

// Fix G: guard cross-project / cross-workspace references so a ticket can't be
// attached to a sprint/milestone/epic/parent from another project, nor linked
// across workspaces.
async function assertSameProject(
  projectId: string,
  refs: { sprintId?: string | null; milestoneId?: string | null; epicId?: string | null; parentId?: string | null }
): Promise<void> {
  const tableChecks: [string, string, string][] = []
  if (refs.sprintId) tableChecks.push(["sprints", refs.sprintId, "sprint"])
  if (refs.milestoneId) tableChecks.push(["milestones", refs.milestoneId, "milestone"])
  for (const [table, rid, label] of tableChecks) {
    const { data } = await sb().from(table).select("project_id").eq("id", rid).maybeSingle()
    if (!data) throw new Error(`Unknown ${label}`)
    if (data.project_id !== projectId) throw new Error(`That ${label} belongs to another project`)
  }
  for (const [rid, label] of [[refs.epicId, "epic"], [refs.parentId, "parent"]] as const) {
    if (!rid) continue
    const { data } = await sb().from("tickets").select("project_id").eq("id", rid).maybeSingle()
    if (!data) throw new Error(`Unknown ${label} ticket`)
    if (data.project_id !== projectId) throw new Error(`That ${label} ticket belongs to another project`)
  }
}

async function ticketWorkspace(ticketId: string): Promise<string | null> {
  const { data: t } = await sb().from("tickets").select("project_id").eq("id", ticketId).maybeSingle()
  if (!t?.project_id) return null
  const { data: p } = await sb().from("projects").select("workspace_id").eq("id", t.project_id as string).maybeSingle()
  return (p?.workspace_id as string) ?? null
}

export async function createNotification(
  userId: string,
  type: string,
  content: string,
  linkUrl?: string
): Promise<Notification> {
  const notification: Notification = {
    id: randomUUID(),
    type,
    content,
    userId,
    read: false,
    createdAt: new Date().toISOString(),
    linkUrl,
  }
  await sb().from("notifications").insert({
    id: notification.id,
    type,
    content,
    user_id: userId,
    read: false,
    link_url: linkUrl ?? null,
    created_at: notification.createdAt,
  })
  emit(`user:${userId}`, "notification", { notification })
  if (slackEnabled() && ["mention", "invite", "pr_review", "milestone_validated"].includes(type)) {
    void notifySlack(content)
  }
  // Best-effort email for high-signal notifications.
  if (emailEnabled() && ["mention", "invite", "pr_review", "assigned"].includes(type)) {
    try {
      const { data: u } = await sb().from("users").select("email,name").eq("id", userId).maybeSingle()
      if (u?.email) {
        const link = linkUrl ? appUrl(linkUrl) : appUrl("/dashboard")
        await sendEmail({
          to: u.email as string,
          subject: content,
          html: layout(content, `<p><a href="${link}">Open in REBUILD</a></p>`),
        })
      }
    } catch {
      // email is best-effort
    }
  }
  return notification
}

export async function createTicket(
  projectId: string,
  input: Partial<Ticket> & { title: string; type: TicketType; priority: TicketPriority }
): Promise<Ticket> {
  const actor = await actorId()
  const { data: project } = await sb().from("projects").select("short_code").eq("id", projectId).maybeSingle()
  const shortCode = (project?.short_code as string) ?? "TASK"
  await assertSameProject(projectId, {
    sprintId: input.sprintId,
    milestoneId: input.milestoneId,
    epicId: input.epicId,
    parentId: input.parentId,
  })

  // Fix F: allocate the ticket number atomically via the per-project counter.
  // Falls back to max+1 if the migration (next_ticket_number) isn't applied yet.
  let nextNum: number
  const { data: seq, error: seqErr } = await sb().rpc("next_ticket_number", {
    p_project_id: projectId,
  })
  if (!seqErr && typeof seq === "number") {
    nextNum = seq
  } else {
    const { data: existing } = await sb().from("tickets").select("short_id").eq("project_id", projectId)
    nextNum = nextTicketNumberFromShortIds((existing ?? []).map((t) => String(t.short_id)))
  }

  const { count } = await sb().from("tickets").select("id", { count: "exact", head: true }).eq("project_id", projectId)
  const now = new Date().toISOString()
  const id = randomUUID()
  const row = {
    id,
    short_id: `${shortCode}-${nextNum}`,
    title: input.title,
    description: input.description ?? "",
    type: input.type,
    priority: input.priority,
    status: input.status ?? "BACKLOG",
    project_id: projectId,
    assignee_id: input.assigneeId ?? null,
    reporter_id: actor,
    labels: input.labels ?? [],
    epic_id: input.epicId ?? null,
    parent_id: input.parentId ?? null,
    milestone_id: input.milestoneId ?? null,
    sprint_id: input.sprintId ?? null,
    points: input.points ?? null,
    due_date: input.dueDate ?? null,
    order: (count ?? 0) + 1,
    created_at: now,
    updated_at: now,
  }
  const { data, error } = await sb().from("tickets").insert(row).select(SEL.ticket).single()
  if (error) throw new Error(error.message)
  const ticket = data as Ticket

  await logActivity(ticket.id, "created", "created this ticket", actor)
  await audit("ticket.create", "Ticket", ticket.id, actor)
  emit(await workspaceRoomsForProject(projectId), "ticket.created", { ticket }, actor)
  if (ticket.assigneeId && ticket.assigneeId !== actor) {
    await createNotification(
      ticket.assigneeId,
      "ticket_assigned",
      `You were assigned ${ticket.shortId} — ${ticket.title}`,
      await ticketLink(ticket)
    )
  }
  return ticket
}

export async function updateTicket(id: string, patch: Partial<Ticket>): Promise<Ticket | null> {
  const actor = await actorId()
  const { data: current } = await sb().from("tickets").select(SEL.ticket).eq("id", id).maybeSingle()
  if (!current) return null
  const before = current as Ticket

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) row.status = patch.status
  if (patch.priority !== undefined) row.priority = patch.priority
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId ?? null
  if (patch.title !== undefined) row.title = patch.title
  if (patch.description !== undefined) row.description = patch.description
  if (patch.points !== undefined) row.points = patch.points ?? null
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate ?? null
  if (patch.labels !== undefined) row.labels = patch.labels
  if (patch.milestoneId !== undefined) row.milestone_id = patch.milestoneId ?? null
  if (patch.sprintId !== undefined) row.sprint_id = patch.sprintId ?? null
  if (patch.order !== undefined) row.order = patch.order

  if (patch.sprintId !== undefined || patch.milestoneId !== undefined) {
    await assertSameProject(before.projectId, {
      sprintId: patch.sprintId,
      milestoneId: patch.milestoneId,
    })
  }

  const { data, error } = await sb().from("tickets").update(row).eq("id", id).select(SEL.ticket).single()
  if (error) throw new Error(error.message)
  const ticket = data as Ticket

  if (patch.status && patch.status !== before.status)
    await logActivity(id, "status_changed", `moved from ${before.status} to ${patch.status}`, actor)
  const assigneeChanged = patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId
  if (assigneeChanged && ticket.assigneeId)
    await logActivity(id, "assigned", `assigned to ${ticket.assigneeId}`, actor)
  if (patch.priority && patch.priority !== before.priority)
    await logActivity(id, "priority_changed", `priority set to ${patch.priority}`, actor)

  await audit("ticket.update", "Ticket", id, actor)
  emit([`ticket:${id}`, ...(await workspaceRoomsForProject(ticket.projectId))], "ticket.updated", { ticket }, actor)
  if (assigneeChanged && ticket.assigneeId && ticket.assigneeId !== actor) {
    await createNotification(
      ticket.assigneeId,
      "ticket_assigned",
      `You were assigned ${ticket.shortId} — ${ticket.title}`,
      await ticketLink(ticket)
    )
  }
  return ticket
}

export async function deleteTicket(id: string): Promise<boolean> {
  const actor = await actorId()
  const { error } = await sb().from("tickets").delete().eq("id", id)
  if (error) return false
  await audit("ticket.delete", "Ticket", id, actor)
  return true
}

export async function addComment(ticketId: string, content: string): Promise<(Comment & { author?: unknown }) | null> {
  const actor = await actorId()
  const { data: ticket } = await sb().from("tickets").select(SEL.ticket).eq("id", ticketId).maybeSingle()
  if (!ticket) return null
  const t = ticket as Ticket
  const now = new Date().toISOString()
  const comment: Comment = { id: randomUUID(), content, ticketId, authorId: actor, createdAt: now, updatedAt: now }
  const { error } = await sb().from("comments").insert({
    id: comment.id,
    content,
    ticket_id: ticketId,
    author_id: actor,
    created_at: now,
    updated_at: now,
  })
  if (error) throw new Error(error.message)

  await logActivity(ticketId, "commented", "added a comment", actor)
  emit([`ticket:${ticketId}`, ...(await workspaceRoomsForProject(t.projectId))], "comment.added", { ticketId, comment }, actor)

  // Recipients: reporter, assignee, watchers, and @mentioned users.
  const { data: watchRows } = await sb().from("ticket_watchers").select("user_id").eq("ticket_id", ticketId)
  const mentioned = await resolveMentions(content)
  const recipients = new Set(
    [t.reporterId, t.assigneeId, ...(watchRows ?? []).map((w) => w.user_id as string), ...mentioned].filter(
      (u): u is string => !!u && u !== actor
    )
  )
  const link = await ticketLink(t)
  for (const uid of recipients) {
    const isMention = mentioned.includes(uid)
    await createNotification(
      uid,
      isMention ? "mention" : "comment",
      isMention
        ? `You were mentioned on ${t.shortId} — ${t.title}`
        : `New comment on ${t.shortId} — ${t.title}`,
      link
    )
  }
  // Mentioned users auto-watch the ticket.
  for (const uid of mentioned) await addWatcher(ticketId, uid)
  return comment
}

// Resolves @mentions (by name or email, case-insensitive) to user ids.
async function resolveMentions(text: string): Promise<string[]> {
  const tokens = [...text.matchAll(/@([\w.\-]+(?:\s+[\w.\-]+)?)/g)].map((m) => m[1].toLowerCase())
  if (tokens.length === 0) return []
  const { data } = await sb().from("users").select("id,name,email")
  const ids = new Set<string>()
  for (const u of data ?? []) {
    const name = String(u.name ?? "").toLowerCase()
    const email = String(u.email ?? "").toLowerCase()
    const handle = email.split("@")[0]
    if (tokens.some((t) => name === t || email === t || handle === t || name.startsWith(t))) {
      ids.add(u.id as string)
    }
  }
  return [...ids]
}

export async function editComment(id: string, content: string): Promise<boolean> {
  const actor = await actorId()
  const { data } = await sb().from("comments").select("author_id,ticket_id").eq("id", id).maybeSingle()
  if (!data) return false
  if (data.author_id !== actor) throw new Error("Only the author can edit")
  await sb().from("comments").update({ content, updated_at: new Date().toISOString() }).eq("id", id)
  emit([`ticket:${data.ticket_id}`], "comment.added", { ticketId: data.ticket_id }, actor)
  return true
}

export async function deleteComment(id: string): Promise<boolean> {
  const actor = await actorId()
  const { data } = await sb().from("comments").select("author_id,ticket_id").eq("id", id).maybeSingle()
  if (!data) return false
  if (data.author_id !== actor) throw new Error("Only the author can delete")
  await sb().from("comments").delete().eq("id", id)
  emit([`ticket:${data.ticket_id}`], "comment.added", { ticketId: data.ticket_id }, actor)
  return true
}

// --- Links & watchers --------------------------------------------------------

export async function addLink(fromTicketId: string, toTicketId: string, type: "BLOCKS" | "RELATES" | "DUPLICATES") {
  if (fromTicketId === toTicketId) throw new Error("Cannot link a ticket to itself")
  const [wsA, wsB] = await Promise.all([ticketWorkspace(fromTicketId), ticketWorkspace(toTicketId)])
  if (!wsA || !wsB || wsA !== wsB) throw new Error("Cannot link tickets across workspaces")
  const { data, error } = await sb()
    .from("ticket_links")
    .insert({ id: randomUUID(), from_ticket_id: fromTicketId, to_ticket_id: toTicketId, type })
    .select(SEL.ticketLink)
    .single()
  if (error) throw new Error(error.message)
  emit([`ticket:${fromTicketId}`, `ticket:${toTicketId}`], "ticket.updated", {})
  return data
}

export async function removeLink(id: string) {
  await sb().from("ticket_links").delete().eq("id", id)
}

export async function addWatcher(ticketId: string, userId: string) {
  await sb().from("ticket_watchers").upsert({ ticket_id: ticketId, user_id: userId }, { onConflict: "ticket_id,user_id" })
}

export async function removeWatcher(ticketId: string, userId: string) {
  await sb().from("ticket_watchers").delete().eq("ticket_id", ticketId).eq("user_id", userId)
}

// Is a short code free within a workspace? Ticket ids are "<short_code>-<n>",
// so a code must be unique per workspace to keep ticket identity unambiguous.
export async function shortCodeAvailable(workspaceId: string, code: string): Promise<boolean> {
  const c = code.trim().toUpperCase()
  if (!c) return false
  const { data } = await sb()
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("short_code", c) // no wildcards → case-insensitive equality
    .limit(1)
  return (data ?? []).length === 0
}

// Derive a unique short code for a workspace from a base string, suffixing a
// counter until it's free.
export async function uniqueShortCode(workspaceId: string, base: string): Promise<string> {
  const root = base.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PROJ"
  if (await shortCodeAvailable(workspaceId, root)) return root
  for (let i = 2; i < 1000; i++) {
    const cand = `${root.slice(0, 5)}${i}`
    if (await shortCodeAvailable(workspaceId, cand)) return cand
  }
  return `${root.slice(0, 3)}${randomUUID().slice(0, 3).toUpperCase()}`
}

export async function createProject(
  workspaceId: string,
  input: { name: string; shortCode: string; description?: string; status?: ProjectStatus }
): Promise<Project> {
  const actor = await actorId()
  const code = input.shortCode.trim().toUpperCase()
  if (!(await shortCodeAvailable(workspaceId, code))) {
    throw Object.assign(
      new Error(`Short code "${code}" is already used by another project in this workspace.`),
      { status: 409 }
    )
  }
  const row = {
    id: randomUUID(),
    name: input.name,
    short_code: code,
    status: input.status ?? "PLANNING",
    workspace_id: workspaceId,
    description: input.description ?? "",
    start_date: new Date().toISOString(),
  }
  const { data, error } = await sb().from("projects").insert(row).select(SEL.project).single()
  if (error) {
    // Race / DB unique index fallback.
    if (/unique|duplicate|projects_ws_shortcode/i.test(error.message))
      throw Object.assign(new Error(`Short code "${code}" is already used in this workspace.`), { status: 409 })
    throw new Error(error.message)
  }
  await audit("project.create", "Project", row.id, actor)
  return data as Project
}

export async function reorderColumn(
  projectId: string,
  status: TicketStatus,
  orderedIds: string[]
): Promise<void> {
  const actor = await actorId()
  await Promise.all(
    orderedIds.map((id, index) =>
      sb()
        .from("tickets")
        .update({ status, order: index, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("project_id", projectId)
    )
  )
  emit(await workspaceRoomsForProject(projectId), "board.reordered", { status, orderedIds }, actor)
}

// --- Git / IDE ---------------------------------------------------------------

function shortHash(): string {
  return randomUUID().replace(/-/g, "").slice(0, 7)
}

export async function saveFile(workspaceId: string, path: string, content: string): Promise<RepoFile | null> {
  const { data: file } = await sb()
    .from("repo_files")
    .select(SEL.repoFile)
    .eq("workspace_id", workspaceId)
    .eq("path", path)
    .maybeSingle()
  if (!file) return null
  const f = file as RepoFile
  const status =
    f.status === "unmodified" ? (content === f.originalContent ? "unmodified" : "modified") : f.status
  const { data } = await sb()
    .from("repo_files")
    .update({ content, status })
    .eq("id", f.id)
    .select(SEL.repoFile)
    .single()
  return data as RepoFile
}

export async function createFile(workspaceId: string, path: string, content = ""): Promise<RepoFile> {
  const row = {
    id: randomUUID(),
    workspace_id: workspaceId,
    path,
    content,
    original_content: "",
    status: "untracked" as const,
  }
  const { data, error } = await sb().from("repo_files").insert(row).select(SEL.repoFile).single()
  if (error) throw new Error(error.message)
  return data as RepoFile
}

export async function commitChanges(
  workspaceId: string,
  message: string,
  branch: string,
  paths?: string[]
): Promise<GitCommit | null> {
  const actor = await actorId()
  let q = sb().from("repo_files").select(SEL.repoFile).eq("workspace_id", workspaceId).neq("status", "unmodified")
  if (paths && paths.length) q = q.in("path", paths)
  const { data: changedData } = await q
  const changed = (changedData ?? []) as RepoFile[]
  if (changed.length === 0) return null

  const ticketMatch = message.match(/\[([A-Z]+-\d+)\]/)
  let ticketId: string | undefined
  if (ticketMatch) {
    const { data: t } = await sb().from("tickets").select("id").eq("short_id", ticketMatch[1]).maybeSingle()
    ticketId = (t?.id as string) ?? undefined
  }

  const commit: GitCommit = {
    id: randomUUID(),
    hash: shortHash(),
    message,
    authorId: actor,
    date: new Date().toISOString(),
    workspaceId,
    ticketId,
    branch,
  }
  await sb().from("git_commits").insert({
    id: commit.id,
    hash: commit.hash,
    message,
    author_id: actor,
    date: commit.date,
    workspace_id: workspaceId,
    ticket_id: ticketId ?? null,
    branch,
  })
  for (const f of changed) {
    await sb().from("repo_files").update({ original_content: f.content, status: "unmodified" }).eq("id", f.id)
  }
  await sb().from("branches").update({ last_commit_hash: commit.hash, last_commit_date: commit.date, last_author_id: actor }).eq("workspace_id", workspaceId).eq("name", branch)

  await audit("git.commit", "Workspace", workspaceId, actor)
  emit(`ws:${workspaceId}`, "git.commit", { commit }, actor)
  if (ticketId) emit([`ticket:${ticketId}`], "ticket.updated", {})
  return commit
}

export async function createBranch(workspaceId: string, name: string, fromHash = "main"): Promise<Branch> {
  const actor = await actorId()
  const row = {
    id: randomUUID(),
    workspace_id: workspaceId,
    name,
    ahead: 0,
    behind: 0,
    protected: false,
    last_commit_hash: fromHash,
    last_commit_date: new Date().toISOString(),
    last_author_id: actor,
  }
  const { data, error } = await sb().from("branches").insert(row).select(SEL.branch).single()
  if (error) throw new Error(error.message)
  await audit("git.branch.create", "Workspace", workspaceId, actor)
  return data as Branch
}

// Keep StoryPoints referenced for type clarity in callers importing from here.
export type { StoryPoints }


// --- Time tracking -----------------------------------------------------------

export async function addTimeEntry(
  ticketId: string,
  minutes: number,
  opts?: { note?: string; spentOn?: string }
): Promise<TimeEntry | null> {
  const actor = (await getSessionUser())?.id
  if (!actor) return null
  const entry: TimeEntry = {
    id: randomUUID(),
    ticketId,
    userId: actor,
    minutes,
    note: opts?.note,
    spentOn: opts?.spentOn ?? new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  }
  const { error } = await sb().from("time_entries").insert({
    id: entry.id,
    ticket_id: ticketId,
    user_id: actor,
    minutes,
    note: entry.note ?? null,
    spent_on: entry.spentOn,
    created_at: entry.createdAt,
  })
  if (error) throw new Error(error.message)
  emit([`ticket:${ticketId}`], "time.logged", { ticketId, entry }, actor)
  return entry
}

export async function deleteTimeEntry(id: string): Promise<boolean> {
  const actor = (await getSessionUser())?.id
  if (!actor) return false
  // Only the author may delete their own entry.
  const { data } = await sb().from("time_entries").select("user_id,ticket_id").eq("id", id).maybeSingle()
  if (!data) return false
  if (data.user_id !== actor) throw new Error("Only the author can delete this entry")
  await sb().from("time_entries").delete().eq("id", id)
  emit([`ticket:${data.ticket_id}`], "time.logged", { ticketId: data.ticket_id }, actor)
  return true
}
