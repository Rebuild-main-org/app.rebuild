// Async read selectors backed by Supabase (service-role). Used by server
// components and route handlers.

import { SEL, getUsersMap, sb } from "./data"
import {
  ghBranches,
  ghCommits,
  ghReadFile,
  ghTreePaths,
  githubEnabled,
  syncPullRequests,
} from "./github"
import {
  PRIORITY_META,
  type AiFeedback,
  type Branch,
  type Milestone,
  type Project,
  type ProjectGroup,
  type RepoFile,
  type Role,
  type Sprint,
  type Ticket,
  type TimeEntry,
  type TicketStatus,
  type TreeNode,
  type User,
  type Workspace,
  type WorkspaceMember,
} from "./types"

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  const { data } = await sb().from("workspaces").select(SEL.workspace).eq("id", id).maybeSingle()
  return (data as Workspace | null) ?? undefined
}

export async function getProject(id: string): Promise<Project | undefined> {
  const { data } = await sb().from("projects").select(SEL.project).eq("id", id).maybeSingle()
  return (data as Project | null) ?? undefined
}

// Admins see every workspace; others only those they belong to (spec §03).
export async function workspacesForUser(
  userId: string,
  role?: Role
): Promise<Workspace[]> {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    const { data } = await sb().from("workspaces").select(SEL.workspace).order("name")
    return (data ?? []) as Workspace[]
  }
  const { data: members } = await sb()
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
  const ids = (members ?? []).map((m) => m.workspace_id as string)
  if (ids.length === 0) return []
  const { data } = await sb().from("workspaces").select(SEL.workspace).in("id", ids).order("name")
  return (data ?? []) as Workspace[]
}

export async function projectsForWorkspace(workspaceId: string): Promise<Project[]> {
  const { data } = await sb().from("projects").select(SEL.project).eq("workspace_id", workspaceId).order("name")
  return (data ?? []) as Project[]
}

export async function membersForWorkspace(
  workspaceId: string
): Promise<(WorkspaceMember & { user: User })[]> {
  const { data } = await sb().from("workspace_members").select(SEL.member).eq("workspace_id", workspaceId)
  const members = (data ?? []) as WorkspaceMember[]
  const users = await getUsersMap()
  return members
    .map((m) => ({ ...m, user: users.get(m.userId)! }))
    .filter((m) => m.user)
}

export async function ticketsForProject(projectId: string): Promise<Ticket[]> {
  const { data } = await sb()
    .from("tickets")
    .select(SEL.ticket)
    .eq("project_id", projectId)
    .order("order", { ascending: true })
  return (data ?? []) as Ticket[]
}

export async function ticketsForWorkspace(workspaceId: string): Promise<Ticket[]> {
  const projects = await projectsForWorkspace(workspaceId)
  const ids = projects.map((p) => p.id)
  if (ids.length === 0) return []
  const { data } = await sb().from("tickets").select(SEL.ticket).in("project_id", ids)
  return (data ?? []) as Ticket[]
}

export async function workspaceIdForProject(projectId: string): Promise<string | undefined> {
  return (await getProject(projectId))?.workspaceId
}

export async function ticketCountsByStatus(
  projectId: string
): Promise<Record<TicketStatus, number>> {
  const counts: Record<TicketStatus, number> = {
    BACKLOG: 0,
    TODO: 0,
    IN_PROGRESS: 0,
    IN_REVIEW: 0,
    DONE: 0,
  }
  for (const t of await ticketsForProject(projectId)) counts[t.status] += 1
  return counts
}

export async function activeWorkloadByUser(workspaceId: string): Promise<Map<string, number>> {
  const tickets = (await ticketsForWorkspace(workspaceId)).filter(
    (t) => t.status === "IN_PROGRESS" || t.status === "IN_REVIEW"
  )
  const map = new Map<string, number>()
  for (const t of tickets) {
    if (!t.assigneeId) continue
    map.set(t.assigneeId, (map.get(t.assigneeId) ?? 0) + 1)
  }
  return map
}

// Engineer dashboard selectors -------------------------------------------------

export async function myTickets(userId: string): Promise<Ticket[]> {
  const { data } = await sb().from("tickets").select(SEL.ticket).eq("assignee_id", userId)
  return (data ?? []) as Ticket[]
}

export async function groupsForWorkspace(workspaceId: string): Promise<ProjectGroup[]> {
  const { data } = await sb()
    .from("project_groups")
    .select(SEL.projectGroup)
    .eq("workspace_id", workspaceId)
    .order("position")
    .order("created_at")
  return (data ?? []) as ProjectGroup[]
}

// id → group_id map. Kept out of SEL.project so reads don't break before the
// group_id column migration is applied (returns {} if the column is missing).
export async function projectGroupMap(workspaceId: string): Promise<Record<string, string | null>> {
  const { data, error } = await sb().from("projects").select("id,group_id").eq("workspace_id", workspaceId)
  if (error) return {}
  const map: Record<string, string | null> = {}
  for (const r of data ?? []) map[r.id as string] = (r.group_id as string | null) ?? null
  return map
}

// Pick the "today" tickets (in-progress, urgent-not-started, due-soon) from a
// set and rank them by priority.
function focusRank(tickets: Ticket[]): Ticket[] {
  const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS")
  const urgentNotStarted = tickets.filter(
    (t) =>
      (t.priority === "CRITICAL" || t.priority === "HIGH") &&
      (t.status === "TODO" || t.status === "BACKLOG")
  )
  const now = Date.now()
  const dueSoon = tickets.filter((t) => {
    if (!t.dueDate || t.status === "DONE") return false
    return (new Date(t.dueDate).getTime() - now) / 86_400_000 <= 2
  })
  const seen = new Set<string>()
  return [...inProgress, ...urgentNotStarted, ...dueSoon]
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .sort((a, b) => PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank)
}

export async function todaysFocus(userId: string): Promise<Ticket[]> {
  return focusRank(await myTickets(userId))
}

// Today's focus for the dashboard: the user's own tickets first, then
// unassigned open tickets across their workspaces (so the card is useful even
// when nothing is assigned to them). Capped for display.
export async function focusForUser(
  userId: string,
  projectIds: string[],
  limit = 15
): Promise<Ticket[]> {
  const mine = await todaysFocus(userId)
  if (projectIds.length === 0) return mine.slice(0, limit)
  const { data } = await sb()
    .from("tickets")
    .select(SEL.ticket)
    .in("project_id", projectIds)
    .is("assignee_id", null)
    .neq("status", "DONE")
  const unassigned = focusRank((data ?? []) as Ticket[])
  const seen = new Set(mine.map((t) => t.id))
  return [...mine, ...unassigned.filter((t) => !seen.has(t.id))].slice(0, limit)
}

export async function milestoneProgress(milestoneId: string): Promise<number> {
  const { data } = await sb().from("tickets").select("status").eq("milestone_id", milestoneId)
  const tickets = data ?? []
  if (tickets.length === 0) return 0
  const done = tickets.filter((t) => t.status === "DONE").length
  return Math.round((done / tickets.length) * 100)
}

export async function projectProgress(projectId: string): Promise<number> {
  const tickets = await ticketsForProject(projectId)
  if (tickets.length === 0) return 0
  const done = tickets.filter((t) => t.status === "DONE").length
  return Math.round((done / tickets.length) * 100)
}

// N+1 fix: progress for ALL milestones of a project in a single query.
export async function milestoneProgressForProject(projectId: string): Promise<Map<string, number>> {
  const { data } = await sb().from("tickets").select("milestone_id,status").eq("project_id", projectId)
  const total = new Map<string, number>()
  const done = new Map<string, number>()
  for (const t of data ?? []) {
    const m = t.milestone_id as string | null
    if (!m) continue
    total.set(m, (total.get(m) ?? 0) + 1)
    if (t.status === "DONE") done.set(m, (done.get(m) ?? 0) + 1)
  }
  const out = new Map<string, number>()
  for (const [m, tot] of total) out.set(m, tot ? Math.round(((done.get(m) ?? 0) / tot) * 100) : 0)
  return out
}

export async function milestonesForProject(projectId: string): Promise<Milestone[]> {
  const { data } = await sb().from("milestones").select(SEL.milestone).eq("project_id", projectId).order("due_date")
  return (data ?? []) as Milestone[]
}

// Velocity: committed vs delivered story points per sprint of a project.
export async function velocityForProject(
  projectId: string
): Promise<{ sprintId: string; name: string; committed: number; done: number }[]> {
  const sprints = await sprintsForProject(projectId)
  const tickets = await ticketsForProject(projectId)
  return sprints.map((s) => {
    const inSprint = tickets.filter((t) => t.sprintId === s.id)
    const committed = inSprint.reduce((sum, t) => sum + (t.points ?? 0), 0)
    const done = inSprint
      .filter((t) => t.status === "DONE")
      .reduce((sum, t) => sum + (t.points ?? 0), 0)
    return { sprintId: s.id, name: s.name, committed, done }
  })
}

// Forecast a project completion date from historical velocity (deterministic).
export async function forecastForProject(projectId: string): Promise<{
  remainingPoints: number
  avgVelocity: number
  sprintsRemaining: number | null
  etaDate: string | null
}> {
  const tickets = await ticketsForProject(projectId)
  const remainingPoints = tickets
    .filter((t) => t.status !== "DONE")
    .reduce((sum, t) => sum + (t.points ?? 0), 0)
  const vel = (await velocityForProject(projectId)).filter((v) => v.done > 0)
  const avgVelocity = vel.length
    ? Math.round((vel.reduce((s, v) => s + v.done, 0) / vel.length) * 10) / 10
    : 0
  if (avgVelocity === 0 || remainingPoints === 0) {
    return { remainingPoints, avgVelocity, sprintsRemaining: null, etaDate: null }
  }
  const sprintsRemaining = Math.ceil(remainingPoints / avgVelocity)
  // Assume 2-week sprints.
  const etaDate = new Date(Date.now() + sprintsRemaining * 14 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  return { remainingPoints, avgVelocity, sprintsRemaining, etaDate }
}

// Capture today's burndown point for a sprint (idempotent per day). Intended to
// be called by a daily cron; also exposed via the sprint snapshot route.
export async function captureSprintSnapshot(sprintId: string): Promise<void> {
  const { data: sprintRow } = await sb().from("sprints").select("project_id").eq("id", sprintId).maybeSingle()
  if (!sprintRow?.project_id) return
  const tickets = (await ticketsForProject(sprintRow.project_id as string)).filter(
    (t) => t.sprintId === sprintId
  )
  const total = tickets.reduce((sum, t) => sum + (t.points ?? 0), 0)
  const done = tickets.filter((t) => t.status === "DONE").reduce((sum, t) => sum + (t.points ?? 0), 0)
  const day = new Date().toISOString().slice(0, 10)
  await sb().from("sprint_snapshots").upsert(
    {
      id: `${sprintId}:${day}`,
      sprint_id: sprintId,
      day,
      remaining_points: total - done,
      done_points: done,
      captured_at: new Date().toISOString(),
    },
    { onConflict: "sprint_id,day" }
  )
}

export async function burndownForSprint(
  sprintId: string
): Promise<{ day: string; remainingPoints: number; donePoints: number }[]> {
  const { data } = await sb()
    .from("sprint_snapshots")
    .select(SEL.sprintSnapshot)
    .eq("sprint_id", sprintId)
    .order("day")
  return (data ?? []).map((s) => ({
    day: s.day as string,
    remainingPoints: s.remainingPoints as number,
    donePoints: s.donePoints as number,
  }))
}

export async function timeEntriesForTicket(ticketId: string): Promise<TimeEntry[]> {
  const { data } = await sb()
    .from("time_entries")
    .select(SEL.timeEntry)
    .eq("ticket_id", ticketId)
    .order("spent_on", { ascending: false })
  return (data ?? []) as TimeEntry[]
}

export async function totalMinutesForTicket(ticketId: string): Promise<number> {
  const entries = await timeEntriesForTicket(ticketId)
  return entries.reduce((sum, e) => sum + e.minutes, 0)
}

export async function sprintsForProject(projectId: string): Promise<Sprint[]> {
  const { data } = await sb().from("sprints").select(SEL.sprint).eq("project_id", projectId).order("start_date")
  return (data ?? []) as Sprint[]
}

export async function commitsForWorkspace(workspaceId: string) {
  if (githubEnabled()) {
    const ws = await getWorkspace(workspaceId)
    if (ws) return ghCommits(workspaceId, ws.githubRepo)
  }
  const { data } = await sb().from("git_commits").select(SEL.commit).eq("workspace_id", workspaceId).order("date", { ascending: false })
  return data ?? []
}
export async function prsForWorkspace(workspaceId: string) {
  if (githubEnabled()) {
    const ws = await getWorkspace(workspaceId)
    // Mirror into Supabase so reviews/merge (by number) stay consistent.
    if (ws) return syncPullRequests(workspaceId, ws.githubRepo)
  }
  const { data } = await sb().from("pull_requests").select(SEL.pr).eq("workspace_id", workspaceId).order("created_at", { ascending: false })
  return data ?? []
}
export async function deploymentsForWorkspace(workspaceId: string) {
  const { data } = await sb().from("deployments").select(SEL.deployment).eq("workspace_id", workspaceId).order("deployed_at", { ascending: false })
  return data ?? []
}
export async function milestonesForWorkspace(workspaceId: string): Promise<Milestone[]> {
  const projects = await projectsForWorkspace(workspaceId)
  const ids = projects.map((p) => p.id)
  if (ids.length === 0) return []
  const { data } = await sb().from("milestones").select(SEL.milestone).in("project_id", ids).order("due_date")
  return (data ?? []) as Milestone[]
}
export async function meetingsForWorkspace(workspaceId: string) {
  const { data } = await sb().from("meetings").select(SEL.meeting).eq("workspace_id", workspaceId).order("start_at")
  return data ?? []
}

export async function notificationsForUser(
  userId: string,
  opts?: { limit?: number; offset?: number }
) {
  const limit = opts?.limit ?? 30
  const offset = opts?.offset ?? 0
  const { data } = await sb()
    .from("notifications")
    .select(SEL.notification)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  return data ?? []
}

// Global search --------------------------------------------------------------

export interface SearchResults {
  tickets: { id: string; shortId: string; title: string; projectId: string; status: string }[]
  projects: { id: string; name: string; workspaceId: string }[]
  workspaces: { id: string; name: string }[]
  documents: { id: string; name: string; workspaceId: string }[]
  leads: { id: string; company: string }[]
}

// Search across the resources the user can see (membership-scoped; ADMIN sees
// all). `q` is matched case-insensitively. Leads only for CRM-enabled roles.
export async function globalSearch(
  user: { id: string; role: Role },
  q: string,
  canCrm = false
): Promise<SearchResults> {
  const term = q.trim()
  const empty: SearchResults = {
    tickets: [],
    projects: [],
    workspaces: [],
    documents: [],
    leads: [],
  }
  if (term.length < 2) return empty
  const like = `%${term}%`

  const workspaces = await workspacesForUser(user.id, user.role)
  const wsIds = workspaces.map((w) => w.id)
  if (wsIds.length === 0 && !canCrm) return empty

  const projects = wsIds.length
    ? ((await sb().from("projects").select(SEL.project).in("workspace_id", wsIds)) .data ?? [])
    : []
  const projIds = (projects as Project[]).map((p) => p.id)

  const [tickets, docs, leads] = await Promise.all([
    projIds.length
      ? sb()
          .from("tickets")
          .select("id,shortId:short_id,title,projectId:project_id,status")
          .in("project_id", projIds)
          .or(`short_id.ilike.${like},title.ilike.${like}`)
          .limit(20)
      : Promise.resolve({ data: [] }),
    wsIds.length
      ? sb()
          .from("documents")
          .select("id,name,workspaceId:workspace_id")
          .in("workspace_id", wsIds)
          .ilike("name", like)
          .limit(10)
      : Promise.resolve({ data: [] }),
    canCrm
      ? sb().from("leads").select("id,company").ilike("company", like).limit(10)
      : Promise.resolve({ data: [] }),
  ])

  return {
    tickets: (tickets.data ?? []) as SearchResults["tickets"],
    projects: (projects as Project[])
      .filter((p) => p.name.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 10)
      .map((p) => ({ id: p.id, name: p.name, workspaceId: p.workspaceId })),
    workspaces: workspaces
      .filter((w) => w.name.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 10)
      .map((w) => ({ id: w.id, name: w.name })),
    documents: (docs.data ?? []) as SearchResults["documents"],
    leads: (leads.data ?? []) as SearchResults["leads"],
  }
}

// Git / IDE selectors ----------------------------------------------------------

export async function repoFiles(workspaceId: string): Promise<RepoFile[]> {
  if (githubEnabled()) {
    const ws = await getWorkspace(workspaceId)
    if (ws) {
      // Explorer lists the real repo tree; content is loaded lazily on open.
      const paths = await ghTreePaths(ws.githubRepo)
      return paths.map((p) => ({
        id: `${workspaceId}:${p}`,
        workspaceId,
        path: p,
        content: "",
        originalContent: "",
        status: "unmodified" as RepoFile["status"],
      }))
    }
  }
  const { data } = await sb().from("repo_files").select(SEL.repoFile).eq("workspace_id", workspaceId).order("path")
  return (data ?? []) as RepoFile[]
}

export async function getRepoFile(
  workspaceId: string,
  path: string
): Promise<RepoFile | undefined> {
  if (githubEnabled()) {
    const ws = await getWorkspace(workspaceId)
    if (ws) {
      const content = await ghReadFile(ws.githubRepo, path)
      if (content == null) return undefined
      return {
        id: `${workspaceId}:${path}`,
        workspaceId,
        path,
        content,
        originalContent: content,
        status: "unmodified",
      }
    }
  }
  const { data } = await sb()
    .from("repo_files")
    .select(SEL.repoFile)
    .eq("workspace_id", workspaceId)
    .eq("path", path)
    .maybeSingle()
  return (data as RepoFile | null) ?? undefined
}

export async function branchesForWorkspace(workspaceId: string): Promise<Branch[]> {
  if (githubEnabled()) {
    const ws = await getWorkspace(workspaceId)
    if (ws) return ghBranches(workspaceId, ws.githubRepo)
  }
  const { data } = await sb().from("branches").select(SEL.branch).eq("workspace_id", workspaceId)
  return (data ?? []) as Branch[]
}

export async function buildTree(workspaceId: string): Promise<TreeNode[]> {
  const files = await repoFiles(workspaceId)
  const root: TreeNode[] = []
  for (const file of files) {
    const parts = file.path.split("/")
    let level = root
    let acc = ""
    parts.forEach((name, idx) => {
      acc = acc ? `${acc}/${name}` : name
      const isLeaf = idx === parts.length - 1
      let node = level.find((n) => n.name === name)
      if (!node) {
        node = {
          name,
          path: acc,
          type: isLeaf ? "file" : "dir",
          ...(isLeaf ? { status: file.status } : { children: [] }),
        }
        level.push(node)
      }
      if (!isLeaf) level = node.children!
    })
  }
  const sortLevel = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => n.children && sortLevel(n.children))
  }
  sortLevel(root)
  return root
}

// --- AI feedback (read) ------------------------------------------------------

// Feedback rows, newest first, with optional filters. Backs the curated-dataset
// export (Ticket 4) and any admin view. Read-only; writes live in mutations.ts.
export async function aiFeedback(
  filter: { feature?: string; workspaceId?: string; minScore?: number; since?: string } = {}
): Promise<AiFeedback[]> {
  let q = sb().from("ai_feedback").select(SEL.aiFeedback).order("created_at", { ascending: false })
  if (filter.feature) q = q.eq("feature", filter.feature)
  if (filter.workspaceId) q = q.eq("workspace_id", filter.workspaceId)
  if (typeof filter.minScore === "number") q = q.gte("score", filter.minScore)
  if (filter.since) q = q.gte("created_at", filter.since)
  const { data } = await q
  return (data ?? []) as unknown as AiFeedback[]
}
