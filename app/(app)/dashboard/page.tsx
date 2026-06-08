import Link from "next/link"
import {
  CheckCircle2,
  GitPullRequest,
  Layers,
  Target,
  TrendingUp,
} from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { sb } from "@/lib/data"
import {
  myTickets,
  projectProgress,
  projectsForWorkspace,
  workspacesForUser,
} from "@/lib/queries"
import { githubEnabled } from "@/lib/github"
import { ghUserCommitsSinceCached, ghUserOpenPRsCached } from "@/lib/gh-cache"
import { PROJECT_STATUS_META, type Project, type ProjectStatus } from "@/lib/types"
import { ProjectStatusBadge } from "@/components/shared/badges"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Reveal } from "@/components/motion/reveal"
import { CountUp } from "@/components/motion/count-up"

export default async function DashboardPage() {
  const user = (await getSessionUser())!
  const [mine, workspaces] = await Promise.all([
    myTickets(user.id),
    workspacesForUser(user.id, user.role),
  ])

  // Projects across the user's workspaces.
  const projectLists = await Promise.all(workspaces.map((w) => projectsForWorkspace(w.id)))
  const projects = projectLists.flat()
  const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]))

  const progressById = new Map<string, number>(
    await Promise.all(projects.map(async (p) => [p.id, await projectProgress(p.id)] as const))
  )
  const boardHref = (projectId: string) => {
    const wsId = projectMap.get(projectId)?.workspaceId
    return `/workspace/${wsId}/projects/${projectId}/board`
  }

  const completedThisSprint = mine.filter((t) => t.status === "DONE")
  const pointsThisSprint = mine
    .filter((t) => t.status === "DONE" && t.sprintId)
    .reduce((sum, t) => sum + (t.points ?? 0), 0)

  // Real git activity, live from GitHub across the user's workspace repos,
  // matched to their GitHub login (the app's git_commits table is only filled
  // by the push webhook, which isn't configured on every repo).
  const { data: prof } = await sb().from("users").select("github_id").eq("id", user.id).maybeSingle()
  const ghLogin = (prof?.github_id as string | null) ?? ""
  const repos = [
    ...new Set(workspaces.map((w) => w.githubRepo).filter((r): r is string => !!r && r.includes("/"))),
  ].slice(0, 8)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const sinceISO = startOfToday.toISOString()

  const canFetchGit = githubEnabled() && !!ghLogin
  const [commitArrays, prArrays] = canFetchGit
    ? await Promise.all([
        Promise.all(repos.map((r) => ghUserCommitsSinceCached(r, ghLogin, sinceISO))),
        Promise.all(repos.map((r) => ghUserOpenPRsCached(r, ghLogin))),
      ])
    : [[], []]
  const myCommitsToday = commitArrays.flat()
  const myOpenPRs = prArrays.flat()

  // REBUILD progression: clients, projects, levels (status), tech stack.
  const clients = workspaces.length
  const totalProjects = projects.length
  const STATUS_ORDER: ProjectStatus[] = ["PLANNING", "ACTIVE", "REVIEW", "ON_HOLD", "DONE", "CANCELLED"]
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: projects.filter((p) => p.status === status).length,
  })).filter((x) => x.count > 0)
  const avgProgress = totalProjects
    ? Math.round([...progressById.values()].reduce((a, b) => a + b, 0) / totalProjects)
    : 0
  const techCounts = (() => {
    const m = new Map<string, number>()
    for (const w of workspaces) for (const tech of w.technologies ?? []) {
      const k = tech.trim()
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 14)
  })()

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Good day, {user.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">
          Here&apos;s what needs your attention today.
        </p>
      </div>

      {/* Indicators */}
      <Reveal className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<CheckCircle2 className="size-4" />}
          label="Completed this sprint"
          value={completedThisSprint.length}
          hint="tickets closed"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Story points delivered"
          value={pointsThisSprint}
          hint="this sprint"
        />
        <StatCard
          icon={<Target className="size-4" />}
          label="Active assignments"
          value={mine.filter((t) => t.status !== "DONE").length}
          hint="open tickets"
        />
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* REBUILD progression */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4" /> REBUILD — progression
            </CardTitle>
            <CardDescription>Clients, projets, niveaux et stack technique.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-5 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-2xl font-semibold tabular-nums">{clients}</div>
                <div className="text-muted-foreground text-xs">Clients (espaces)</div>
              </div>
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-2xl font-semibold tabular-nums">{totalProjects}</div>
                <div className="text-muted-foreground text-xs">Projets</div>
              </div>
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-2xl font-semibold tabular-nums">{avgProgress}%</div>
                <div className="text-muted-foreground text-xs">Avancement moyen</div>
              </div>
            </div>

            <div>
              <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">Projets par niveau</div>
              {byStatus.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun projet pour l&apos;instant.</p>
              ) : (
                <div className="space-y-2">
                  {byStatus.map((s) => (
                    <div key={s.status} className="flex items-center gap-2">
                      <div className="w-24 shrink-0">
                        <ProjectStatusBadge status={s.status} />
                      </div>
                      <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${totalProjects ? Math.round((s.count / totalProjects) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">Stack technique</div>
              {techCounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune techno renseignée sur les espaces.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {techCounts.map((tech) => (
                    <Badge key={tech.name} variant="secondary" className="gap-1">
                      {tech.name}
                      <span className="text-muted-foreground tabular-nums">{tech.count}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Git activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitPullRequest className="size-4" /> Git activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">
                My commits today
              </div>
              {myCommitsToday.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {!ghLogin
                    ? "Link your GitHub username on your profile to see your commits."
                    : "No commits yet."}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {myCommitsToday.map((c) => (
                    <li key={`${c.repo}-${c.hash}`} className="text-sm">
                      <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                        <code className="text-muted-foreground text-xs">{c.hash}</code> {c.message}
                      </a>
                      <span className="text-muted-foreground block text-[11px]">
                        {c.repo} · {c.branch}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">
                My open PRs
              </div>
              {myOpenPRs.length === 0 ? (
                <p className="text-muted-foreground text-sm">None open.</p>
              ) : (
                <ul className="space-y-1.5">
                  {myOpenPRs.map((p) => (
                    <li key={`${p.repo}-${p.number}`} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">#{p.number}</Badge>
                      <a href={p.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                        {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* My projects */}
      <Card>
        <CardHeader>
          <CardTitle>My projects</CardTitle>
          <CardDescription>
            Projects across your workspaces with health and progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const progress = progressById.get(p.id) ?? 0
            return (
              <Link
                key={p.id}
                href={boardHref(p.id)}
                className="hover:border-primary/40 rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${PROJECT_STATUS_META[p.status].color}`}
                  >
                    {PROJECT_STATUS_META[p.status].label}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {p.description}
                </p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-md">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold">
            <CountUp value={value} />
          </div>
          <div className="text-muted-foreground text-xs">
            {label} · {hint}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
