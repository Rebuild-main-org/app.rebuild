// Analytics computations (spec §13), backed by Supabase.

import { SEL, sb } from "./data"
import type { Milestone, Project, Ticket, User, Workspace } from "./types"

const WEEK = 7 * 86_400_000

export interface SizingCalibration {
  sampled: number // DONE tickets that have both points and logged time
  minutesPerPoint: number
  consistency: number // 0–100; higher = estimates track actuals more reliably
}

// Compares estimated story points against actual logged time on DONE tickets so
// the team can calibrate sizing. Consistency = inverse coefficient of variation
// of minutes-per-point (low spread → high consistency).
export async function estimationAccuracy(projectIds: string[]): Promise<SizingCalibration> {
  const empty = { sampled: 0, minutesPerPoint: 0, consistency: 0 }
  if (projectIds.length === 0) return empty
  const { data: tk } = await sb()
    .from("tickets")
    .select("id,points,status")
    .in("project_id", projectIds)
    .eq("status", "DONE")
  const done = (tk ?? []).filter((t) => ((t.points as number) ?? 0) > 0)
  if (done.length === 0) return empty
  const { data: te } = await sb()
    .from("time_entries")
    .select("ticket_id,minutes")
    .in("ticket_id", done.map((t) => t.id as string))
  const minutesByTicket = new Map<string, number>()
  for (const e of te ?? [])
    minutesByTicket.set(
      e.ticket_id as string,
      (minutesByTicket.get(e.ticket_id as string) ?? 0) + ((e.minutes as number) ?? 0)
    )
  const ratios: number[] = []
  for (const t of done) {
    const m = minutesByTicket.get(t.id as string)
    if (m && m > 0) ratios.push(m / (t.points as number))
  }
  if (ratios.length === 0) return empty
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const variance = ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / ratios.length
  const cov = mean > 0 ? Math.sqrt(variance) / mean : 1
  return {
    sampled: ratios.length,
    minutesPerPoint: Math.round(mean),
    consistency: Math.max(0, Math.min(100, Math.round((1 - cov) * 100))),
  }
}

async function fetchAll() {
  const [tickets, workspaces, projects, milestones, users] = await Promise.all([
    sb().from("tickets").select(SEL.ticket),
    sb().from("workspaces").select(SEL.workspace),
    sb().from("projects").select(SEL.project),
    sb().from("milestones").select(SEL.milestone),
    sb().from("users").select(SEL.user),
  ])
  return {
    tickets: (tickets.data ?? []) as Ticket[],
    workspaces: (workspaces.data ?? []) as Workspace[],
    projects: (projects.data ?? []) as Project[],
    milestones: (milestones.data ?? []) as Milestone[],
    users: (users.data ?? []) as User[],
  }
}

export interface GlobalAnalytics {
  activeWorkspaces: number
  activeProjects: number
  totalOpenTickets: number
  loadPerEngineer: number
  onTimeRate: number
  createdThisWeek: number
  resolvedThisWeek: number
}

export interface EngineerStat {
  userId: string
  name: string
  assigned: number
  completed: number
  open: number
  points: number
}

export interface WorkspaceStat {
  workspaceId: string
  name: string
  bugs: number
  features: number
  velocity: number
  milestonesOnTime: number
  milestonesLate: number
}

export interface AnalyticsBundle {
  global: GlobalAnalytics
  engineers: EngineerStat[]
  workspaces: WorkspaceStat[]
}

// --- DORA metrics (COULD) ----------------------------------------------------

export interface DoraMetrics {
  windowDays: number
  deployFrequencyPerWeek: number
  leadTimeHours: number | null // median commit → production deploy
  changeFailureRate: number // % of prod deploys that failed
  mttrHours: number | null // mean time to restore after a failed prod deploy
  prodDeploys: number
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Computes the four DORA metrics over the last `windowDays`. Lead time links a
// deployment to its commit via commit_hash. Optionally scoped to one workspace.
export async function doraMetrics(
  windowDays = 90,
  workspaceId?: string
): Promise<DoraMetrics> {
  const since = Date.now() - windowDays * 86_400_000
  let depQ = sb().from("deployments").select(SEL.deployment).gte("deployed_at", new Date(since).toISOString())
  let comQ = sb().from("git_commits").select(SEL.commit)
  if (workspaceId) {
    depQ = depQ.eq("workspace_id", workspaceId)
    comQ = comQ.eq("workspace_id", workspaceId)
  }
  const [{ data: deps }, { data: commits }] = await Promise.all([depQ, comQ])

  const prod = (deps ?? [])
    .filter((d) => d.env === "PRODUCTION")
    .sort((a, b) => new Date(a.deployedAt).getTime() - new Date(b.deployedAt).getTime())
  const success = prod.filter((d) => d.status === "SUCCESS")
  const failed = prod.filter((d) => d.status === "FAILED")

  // Lead time: commit.date → matching deployment.deployedAt (hours).
  const byHash = new Map<string, string>()
  for (const c of commits ?? []) byHash.set((c.hash as string)?.slice(0, 7), c.date as string)
  const leadTimes: number[] = []
  for (const d of success) {
    const commitDate = byHash.get((d.commitHash as string)?.slice(0, 7))
    if (commitDate) {
      const h = (new Date(d.deployedAt).getTime() - new Date(commitDate).getTime()) / 3_600_000
      if (h >= 0) leadTimes.push(h)
    }
  }

  // MTTR: failed prod deploy → next successful prod deploy.
  const recoveries: number[] = []
  for (const f of failed) {
    const next = success.find((s) => new Date(s.deployedAt).getTime() > new Date(f.deployedAt).getTime())
    if (next) recoveries.push((new Date(next.deployedAt).getTime() - new Date(f.deployedAt).getTime()) / 3_600_000)
  }

  return {
    windowDays,
    deployFrequencyPerWeek: Math.round((success.length / (windowDays / 7)) * 10) / 10,
    leadTimeHours: leadTimes.length ? Math.round((median(leadTimes) ?? 0) * 10) / 10 : null,
    changeFailureRate: prod.length ? Math.round((failed.length / prod.length) * 100) : 0,
    mttrHours: recoveries.length ? Math.round((recoveries.reduce((a, b) => a + b, 0) / recoveries.length) * 10) / 10 : null,
    prodDeploys: prod.length,
  }
}

export async function analytics(): Promise<AnalyticsBundle> {
  const { tickets, workspaces, projects, milestones, users } = await fetchAll()
  const now = Date.now()

  const open = tickets.filter((t) => t.status !== "DONE")
  const engineers = users.filter((u) => u.role === "ENGINEER")
  const doneMs = milestones.filter((m) => m.done)
  const onTime = doneMs.filter(
    (m) => !m.validatedAt || new Date(m.validatedAt) <= new Date(m.dueDate)
  ).length

  const global: GlobalAnalytics = {
    activeWorkspaces: workspaces.filter((w) => w.status === "ACTIVE").length,
    activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
    totalOpenTickets: open.length,
    loadPerEngineer:
      Math.round((open.length / Math.max(engineers.length, 1)) * 10) / 10,
    onTimeRate: doneMs.length ? Math.round((onTime / doneMs.length) * 100) : 100,
    createdThisWeek: tickets.filter(
      (t) => now - new Date(t.createdAt).getTime() <= WEEK
    ).length,
    resolvedThisWeek: tickets.filter(
      (t) => t.status === "DONE" && now - new Date(t.updatedAt).getTime() <= WEEK
    ).length,
  }

  const engineers2: EngineerStat[] = users
    .filter((u) => u.role === "ENGINEER" || u.role === "LEAD")
    .map((u) => {
      const mine = tickets.filter((t) => t.assigneeId === u.id)
      const completed = mine.filter((t) => t.status === "DONE")
      return {
        userId: u.id,
        name: u.name,
        assigned: mine.length,
        completed: completed.length,
        open: mine.filter((t) => t.status !== "DONE").length,
        points: completed.reduce((s, t) => s + (t.points ?? 0), 0),
      }
    })
    .filter((s) => s.assigned > 0)

  const workspaceStats: WorkspaceStat[] = workspaces.map((w) => {
    const projectIds = new Set(
      projects.filter((p) => p.workspaceId === w.id).map((p) => p.id)
    )
    const wsTickets = tickets.filter((t) => projectIds.has(t.projectId))
    const wsMs = milestones.filter((m) => projectIds.has(m.projectId))
    return {
      workspaceId: w.id,
      name: w.name,
      bugs: wsTickets.filter((t) => t.type === "BUG").length,
      features: wsTickets.filter((t) => t.type === "FEATURE").length,
      velocity: wsTickets
        .filter((t) => t.status === "DONE")
        .reduce((s, t) => s + (t.points ?? 0), 0),
      milestonesOnTime: wsMs.filter(
        (m) => m.done && (!m.validatedAt || new Date(m.validatedAt) <= new Date(m.dueDate))
      ).length,
      milestonesLate: wsMs.filter(
        (m) => !m.done && new Date(m.dueDate) < new Date()
      ).length,
    }
  })

  return { global, engineers: engineers2, workspaces: workspaceStats }
}
