import { notFound } from "next/navigation"
import {
  CheckCircle2,
  CircleDot,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Gauge,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react"

import { getUsersMap } from "@/lib/data"
import { can } from "@/lib/auth"
import { getSessionUser } from "@/lib/auth/session"
import {
  branchesForWorkspace,
  commitsForWorkspace,
  deploymentsForWorkspace,
  getWorkspace,
  prsForWorkspace,
} from "@/lib/queries"
import { ghCommits, githubEnabled } from "@/lib/github"
import { computeDora } from "@/lib/dora"
import { GitLiveControls } from "@/components/git/git-live-controls"
import { WorkflowRuns } from "@/components/git/workflow-runs"
import { CommitList, type CommitItem } from "@/components/git/commit-list"
import { PrActions } from "@/components/git/pr-actions"
import { PrDiff } from "@/components/git/pr-diff"
import { BranchTools, DeleteBranchButton } from "@/components/git/branch-tools"
import { VercelDeployments } from "@/components/git/vercel-deployments"
import { ReleasesCard } from "@/components/git/releases-card"
import type { CIStatus, PRStatus } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function CIBadge({ ci }: { ci: CIStatus }) {
  if (ci === "PASSING")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" /> passing
      </span>
    )
  if (ci === "FAILING")
    return (
      <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
        <XCircle className="size-3.5" /> failing
      </span>
    )
  if (ci === "RUNNING")
    return (
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Loader2 className="size-3.5 animate-spin" /> running
      </span>
    )
  return null
}

function PRStatusBadge({ status }: { status: PRStatus }) {
  if (status === "MERGED")
    return (
      <Badge variant="secondary" className="gap-1">
        <GitMerge className="size-3" /> Merged
      </Badge>
    )
  if (status === "OPEN")
    return (
      <Badge className="gap-1">
        <CircleDot className="size-3" /> Open
      </Badge>
    )
  return <Badge variant="outline">Closed</Badge>
}

export default async function GitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()

  const [branches, user, prs, commits, deployments, users] = await Promise.all([
    branchesForWorkspace(id),
    getSessionUser(),
    prsForWorkspace(id),
    commitsForWorkspace(id),
    deploymentsForWorkspace(id),
    getUsersMap(),
  ])
  const dora = computeDora(
    commits.map((c) => ({ date: c.date })),
    deployments.map((d) => ({ status: d.status, deployedAt: d.deployedAt }))
  )
  const canMerge = can(user ?? undefined, "pr.merge")
  const canReview = can(user ?? undefined, "pr.approve")

  // Prefer real GitHub commits (real SHAs → clickable diffs); fall back to the DB log.
  const liveCommits =
    githubEnabled() && ws.githubRepo?.includes("/") ? await ghCommits(id, ws.githubRepo) : []
  const commitItems: CommitItem[] = liveCommits.length
    ? liveCommits.map((c) => ({ sha: c.id, hash: c.hash, message: c.message, authorName: c.authorName, date: c.date }))
    : commits.map((c) => ({
        sha: c.hash,
        hash: c.hash,
        message: c.message,
        authorName: (c as { authorName?: string }).authorName ?? users.get(c.authorId ?? "")?.name,
        date: c.date,
      }))

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Git & CI/CD</h1>
          <p className="text-muted-foreground text-sm">{ws.githubRepo}</p>
        </div>
        <GitLiveControls workspaceId={id} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="size-4" /> Branches
            </CardTitle>
            <BranchTools workspaceId={id} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {branches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-2">
                {b.protected && (
                  <Lock className="text-muted-foreground size-3.5" />
                )}
                <code className="text-sm">{b.name}</code>
                {b.name === "main" && <Badge variant="secondary">default</Badge>}
              </div>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                {(b.ahead > 0 || b.behind > 0) && (
                  <span>
                    ↑{b.ahead} ↓{b.behind}
                  </span>
                )}
                <span>
                  {users.get(b.lastAuthorId ?? "")?.name} ·{" "}
                  {new Date(b.lastCommitDate).toLocaleDateString()}
                </span>
                {b.name !== "main" && b.name !== "master" && !b.protected && (
                  <DeleteBranchButton workspaceId={id} name={b.name} />
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* DORA metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4" /> DORA metrics <span className="text-muted-foreground text-xs font-normal">· last {dora.windowDays} days</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Deploy frequency" value={`${dora.deploysPerWeek}/wk`} hint={`${dora.deployCount} deploys`} />
            <Metric label="Lead time" value={dora.leadTimeHours != null ? fmtHours(dora.leadTimeHours) : "—"} hint="commit → deploy" />
            <Metric label="Change failure" value={`${Math.round(dora.changeFailureRate * 100)}%`} hint="failed deploys" />
            <Metric label="MTTR" value={dora.mttrHours != null ? fmtHours(dora.mttrHours) : "—"} hint="time to restore" />
          </div>
        </CardContent>
      </Card>

      {/* Real GitHub Actions CI runs */}
      <WorkflowRuns workspaceId={id} />

      {/* Releases & changelog */}
      <ReleasesCard workspaceId={id} canPublish={canMerge} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitPullRequest className="size-4" /> Pull requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {prs.map((pr) => (
              <div
                key={pr.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      #{pr.number}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {pr.title}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {pr.branchFrom} → {pr.branchTo} ·{" "}
                    {(pr as {authorName?:string}).authorName ?? users.get(pr.authorId ?? "")?.name}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <PRStatusBadge status={pr.status} />
                    <CIBadge ci={pr.ci} />
                  </div>
                  <div className="flex items-center gap-1">
                    <PrDiff workspaceId={id} prNumber={pr.number} />
                    <PrActions
                      workspaceId={id}
                      prNumber={pr.number}
                      status={pr.status}
                      ci={pr.ci}
                      canMerge={canMerge}
                      canReview={canReview}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <VercelDeployments workspaceId={id} canPromote={canMerge} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commits</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitList commits={commitItems} workspaceId={id} />
        </CardContent>
      </Card>
    </div>
  )
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h}h`
  return `${(h / 24).toFixed(1)}d`
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-muted-foreground text-xs">{hint}</div>
    </div>
  )
}
