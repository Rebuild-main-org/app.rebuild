import { notFound } from "next/navigation"
import Link from "next/link"
import { Activity, GitCommit, Rocket, Users } from "lucide-react"

import { getUsersMap } from "@/lib/data"
import {
  activeWorkloadByUser,
  commitsForWorkspace,
  deploymentsForWorkspace,
  getWorkspace,
  membersForWorkspace,
  prsForWorkspace,
  projectsForWorkspace,
  ticketsForWorkspace,
} from "@/lib/queries"
import { ghRecentChangesAllBranches, githubEnabled } from "@/lib/github"
import { estimationAccuracy } from "@/lib/analytics"
import { workspaceAiSpend } from "@/lib/ai-usage"
import { cn } from "@/lib/utils"
import type { Deployment, GitCommit as GitCommitModel } from "@/lib/types"
import { AiInsights } from "@/components/ai/ai-insights"
import { ArchitectureImport } from "@/components/workspace/architecture-import"
import { AgentSelector } from "@/components/workspace/agent-selector"
import { CliCommand } from "@/components/workspace/cli-command"
import { ProjectStatusBadge, RoleBadge, UserAvatar } from "@/components/shared/badges"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()

  const [projects, tickets, prs, members, workload, commits, deploys, users] =
    await Promise.all([
      projectsForWorkspace(id),
      ticketsForWorkspace(id),
      prsForWorkspace(id),
      membersForWorkspace(id),
      activeWorkloadByUser(id),
      commitsForWorkspace(id),
      deploymentsForWorkspace(id),
      getUsersMap(),
    ])
  // Real recent commits + diffs (before/after) from GitHub, across ALL branches
  // (one repo per workspace, one branch per project).
  const recentChanges =
    ws.githubRepo && ws.githubRepo.includes("/") && githubEnabled()
      ? await ghRecentChangesAllBranches(ws.githubRepo, 6)
      : []
  const activeProjects = projects.filter((p) => p.status === "ACTIVE")
  const openTickets = tickets.filter((t) => t.status !== "DONE")
  const openPRs = prs.filter((p) => p.status === "OPEN")
  // Sizing calibration: estimated points vs actual logged time on DONE tickets.
  const sizing = await estimationAccuracy(projects.map((p) => p.id))
  // This-month AI cost/tokens for this workspace.
  const aiSpend = await workspaceAiSpend(id)

  // Recent activity feed: merge commits and deploys
  const recentCommits = (commits as GitCommitModel[]).map((c) => ({ kind: "commit" as const, at: c.date, data: c }))
  const recentDeploys = (deploys as Deployment[]).map((d) => ({ kind: "deploy" as const, at: d.deployedAt, data: d }))
  const feed = [...recentCommits, ...recentDeploys]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{ws.name}</h1>
          <p className="text-muted-foreground text-sm">
            {ws.githubRepo} · client {ws.clientName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ArchitectureImport workspaceId={id} />
          <AiInsights workspaceId={id} />
          <Badge variant={ws.status === "ACTIVE" ? "default" : "secondary"}>
            {ws.status}
          </Badge>
        </div>
      </div>

      {/* Health summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active projects" value={`${activeProjects.length}/${projects.length}`} />
        <Stat label="Open tickets" value={`${openTickets.length}`} />
        <Stat label="PRs awaiting review" value={`${openPRs.length}`} />
        <Stat
          label="Sizing consistency"
          value={sizing.sampled > 0 ? `${sizing.consistency}% · ${sizing.minutesPerPoint}m/pt` : "—"}
        />
      </div>

      {/* AI Agent — quick config (full library; rebuild216 injects on connect) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4" /> AI Agent
              </CardTitle>
              <CardDescription>
                Pick the agent(s) rebuild216 injects for this workspace. Manage the library in Admin → AI Agents.
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">
                ${aiSpend.costUsd.toFixed(2)} · {(aiSpend.tokens / 1000).toFixed(0)}k
              </div>
              <div className="text-muted-foreground text-xs">AI this month ({aiSpend.calls} runs)</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AgentSelector workspaceId={id} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent code changes (before / after diffs) */}
        <Card className="flex h-[28rem] flex-col lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCommit className="size-4" /> Recent code changes
            </CardTitle>
            <CardDescription>Latest commits across all branches, with before / after diffs.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-5 overflow-y-auto">
            {recentChanges.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {githubEnabled()
                  ? "No recent commits, or this workspace's repo isn't reachable."
                  : "Connect a GitHub repo to see code changes."}
              </p>
            ) : (
              recentChanges.map((c) => (
                <div key={c.sha} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {c.branch && (
                          <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px]">
                            {c.branch}
                          </span>
                        )}
                        <span className="truncate text-sm font-medium">{c.message}</span>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {c.author} · <code className="text-[11px]">{c.shortSha}</code>
                        {c.date && ` · ${new Date(c.date).toLocaleString()}`}
                      </div>
                    </div>
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0 text-xs">
                      GitHub ↗
                    </a>
                  </div>
                  {c.files.map((f) => (
                    <div key={f.filename} className="overflow-hidden rounded-md border">
                      <div className="bg-muted/40 flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                        <span className="truncate font-mono">{f.filename}</span>
                        <span className="shrink-0 font-mono">
                          <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>{" "}
                          <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                        </span>
                      </div>
                      <DiffLines patch={f.patch} />
                    </div>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Member workload */}
        <Card className="flex h-[28rem] flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" /> Team workload
            </CardTitle>
            <CardDescription>Active tickets per member.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <UserAvatar name={m.user.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.user.name}
                  </div>
                </div>
                <RoleBadge role={m.role} />
                <Badge variant="outline">{workload.get(m.userId) ?? 0}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Projects */}
        <Card className="flex h-[24rem] flex-col">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {projects.map((p) => (
              <div key={p.id} className="space-y-1.5 rounded-md border p-3">
                <Link
                  href={`/workspace/${id}/projects/${p.id}/board`}
                  className="hover:text-primary flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-muted-foreground text-xs">{p.shortCode}</div>
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </Link>
                {/* Ready-to-paste rebuild216 command for this project. */}
                <CliCommand command={`rebuild216 "${p.name}"`} />
              </div>
            ))}
            {projects.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">No projects yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="flex h-[24rem] flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {feed.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                {item.kind === "commit" ? (
                  <GitCommit className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                ) : (
                  <Rocket className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {item.kind === "commit" ? (
                    <span>
                      <span className="text-muted-foreground">
                        {users.get(item.data.authorId)?.name}
                      </span>{" "}
                      pushed{" "}
                      <code className="text-xs">{item.data.hash}</code>{" "}
                      {item.data.message}
                    </span>
                  ) : (
                    <span>
                      Deployed to{" "}
                      <span className="font-medium">
                        {item.data.env.toLowerCase()}
                      </span>{" "}
                      ({item.data.commitHash})
                    </span>
                  )}
                  <div className="text-muted-foreground text-[11px]">
                    {new Date(item.at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Render a unified diff patch with colored before (−) / after (+) lines.
function DiffLines({ patch }: { patch?: string }) {
  if (!patch) {
    return <div className="text-muted-foreground p-2 text-[11px]">No preview (binary or large file).</div>
  }
  const lines = patch.split("\n")
  const shown = lines.slice(0, 16)
  return (
    <pre className="overflow-x-auto p-2 text-[11px] leading-relaxed">
      {shown.map((l, i) => {
        const cls =
          l.startsWith("+") && !l.startsWith("+++")
            ? "text-emerald-600 dark:text-emerald-400"
            : l.startsWith("-") && !l.startsWith("---")
              ? "text-red-600 dark:text-red-400"
              : l.startsWith("@@")
                ? "text-sky-600 dark:text-sky-400"
                : "text-muted-foreground"
        return (
          <div key={i} className={cn("whitespace-pre", cls)}>
            {l || " "}
          </div>
        )
      })}
      {lines.length > shown.length && (
        <div className="text-muted-foreground">… {lines.length - shown.length} more lines</div>
      )}
    </pre>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </CardContent>
    </Card>
  )
}
