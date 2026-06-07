// Automated report generation (spec §13): weekly, sprint and release reports.

import { SEL, sb, userById } from "./data"
import {
  getWorkspace,
  projectsForWorkspace,
  ticketsForWorkspace,
} from "./queries"
import { STATUS_LABELS, type Sprint, type Ticket } from "./types"

const WEEK = 7 * 86_400_000
const STALE = 5 * 86_400_000

export type ReportType = "weekly" | "sprint" | "release"

export interface ReportSection {
  heading: string
  lines: string[]
}
export interface Report {
  type: ReportType
  title: string
  generatedAt: string
  sections: ReportSection[]
}

export async function generateReport(
  type: ReportType,
  workspaceId: string
): Promise<Report> {
  const ws = await getWorkspace(workspaceId)
  const now = Date.now()
  const generatedAt = new Date().toISOString()
  const base = ws?.name ?? "Workspace"

  if (type === "weekly") {
    const tickets = await ticketsForWorkspace(workspaceId)
    const completed = tickets.filter(
      (t) => t.status === "DONE" && now - new Date(t.updatedAt).getTime() <= WEEK
    )
    const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS")
    const blocked = tickets.filter(
      (t) => t.status !== "DONE" && now - new Date(t.updatedAt).getTime() > STALE
    )
    const points = completed.reduce((s, t) => s + (t.points ?? 0), 0)
    return {
      type,
      title: `Weekly report — ${base}`,
      generatedAt,
      sections: [
        { heading: `Completed this week (${completed.length})`, lines: completed.map((t) => `${t.shortId} ${t.title}`) },
        { heading: `In progress (${inProgress.length})`, lines: await withNames(inProgress) },
        { heading: `Possibly blocked (${blocked.length})`, lines: blocked.map((t) => `${t.shortId} ${t.title} — no movement in 5+ days`) },
        { heading: "Velocity", lines: [`${points} story points delivered this week`] },
      ],
    }
  }

  if (type === "sprint") {
    const projects = await projectsForWorkspace(workspaceId)
    const projectIds = projects.map((p) => p.id)
    let sprint: Sprint | undefined
    if (projectIds.length) {
      const { data } = await sb()
        .from("sprints")
        .select(SEL.sprint)
        .in("project_id", projectIds)
        .order("start_date", { ascending: false })
        .limit(1)
      sprint = (data?.[0] as Sprint) ?? undefined
    }
    if (!sprint) {
      return { type, title: `Sprint report — ${base}`, generatedAt, sections: [{ heading: "No sprint found", lines: [] }] }
    }
    const { data: tData } = await sb().from("tickets").select(SEL.ticket).eq("sprint_id", sprint.id)
    const tickets = (tData ?? []) as Ticket[]
    const done = tickets.filter((t) => t.status === "DONE")
    const carried = tickets.filter((t) => t.status !== "DONE")
    return {
      type,
      title: `Sprint report — ${sprint.name}`,
      generatedAt,
      sections: [
        { heading: "Sprint goal", lines: [sprint.goal] },
        { heading: `Completed (${done.length})`, lines: done.map((t) => `${t.shortId} ${t.title}`) },
        { heading: `Carried over (${carried.length})`, lines: carried.map((t) => `${t.shortId} ${t.title} (${STATUS_LABELS[t.status]})`) },
        { heading: "Outcome", lines: [carried.length === 0 ? "Sprint goal achieved ✓" : `${done.length}/${tickets.length} tickets completed`] },
      ],
    }
  }

  // release
  const { data: deployData } = await sb()
    .from("deployments")
    .select(SEL.deployment)
    .eq("workspace_id", workspaceId)
    .eq("env", "PRODUCTION")
    .order("deployed_at", { ascending: false })
    .limit(1)
  const deploy = deployData?.[0]
  const { data: prData } = await sb()
    .from("pull_requests")
    .select(SEL.pr)
    .eq("workspace_id", workspaceId)
    .eq("status", "MERGED")
  const mergedPrs = prData ?? []
  const ticketIds = mergedPrs.map((p) => p.ticketId).filter(Boolean) as string[]
  let delivered: Ticket[] = []
  if (ticketIds.length) {
    const { data } = await sb().from("tickets").select(SEL.ticket).in("id", ticketIds)
    delivered = (data ?? []) as Ticket[]
  }
  return {
    type: "release",
    title: `Release report — ${base}`,
    generatedAt,
    sections: [
      { heading: "Latest production deploy", lines: deploy ? [`${deploy.commitHash} on ${new Date(deploy.deployedAt).toLocaleString()} by ${(await userById(deploy.authorId))?.name ?? "?"}`] : ["No production deploy yet"] },
      { heading: `Changelog (${mergedPrs.length} merged PRs)`, lines: mergedPrs.map((p) => `#${p.number} ${p.title}`) },
      { heading: `Features & fixes delivered (${delivered.length})`, lines: delivered.map((t) => `${t.shortId} ${t.title}`) },
    ],
  }
}

async function withNames(tickets: Ticket[]): Promise<string[]> {
  return Promise.all(
    tickets.map(async (t) => {
      const name = t.assigneeId ? (await userById(t.assigneeId))?.name ?? "unassigned" : "unassigned"
      return `${t.shortId} ${t.title} — ${name}`
    })
  )
}

export function reportToMarkdown(r: Report): string {
  return [
    `# ${r.title}`,
    `_Generated ${new Date(r.generatedAt).toLocaleString()}_`,
    "",
    ...r.sections.flatMap((s) => [
      `## ${s.heading}`,
      ...(s.lines.length ? s.lines.map((l) => `- ${l}`) : ["_none_"]),
      "",
    ]),
  ].join("\n")
}
