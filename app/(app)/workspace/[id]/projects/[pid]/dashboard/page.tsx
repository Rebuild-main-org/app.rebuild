import { CalendarClock } from "lucide-react"

import {
  burndownForSprint,
  forecastForProject,
  milestoneProgressForProject,
  milestonesForProject,
  sprintsForProject,
  ticketsForProject,
} from "@/lib/queries"
import {
  PRIORITY_META,
  TYPE_META,
  type TicketPriority,
  type TicketType,
} from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ProjectSummary } from "@/components/ai/project-summary"
import { Reveal } from "@/components/motion/reveal"

export default async function ProjectDashboard({
  params,
}: {
  params: Promise<{ pid: string }>
}) {
  const { pid } = await params
  const [tickets, milestonesRaw, sprints, forecast, msProgress] = await Promise.all([
    ticketsForProject(pid),
    milestonesForProject(pid),
    sprintsForProject(pid),
    forecastForProject(pid),
    milestoneProgressForProject(pid),
  ])
  const activeSprint = sprints.find((s) => s.status === "ACTIVE")
  const burndown = activeSprint ? await burndownForSprint(activeSprint.id) : []
  const maxRemain = Math.max(1, ...burndown.map((b) => b.remainingPoints))
  // Precompute milestone completion (async) before render.
  const milestones = milestonesRaw.map((m) => ({
    ...m,
    pct: m.done ? 100 : (msProgress.get(m.id) ?? 0),
  }))

  const byType = (Object.keys(TYPE_META) as TicketType[]).map((t) => ({
    key: t,
    count: tickets.filter((x) => x.type === t).length,
  }))
  const byPriority = (Object.keys(PRIORITY_META) as TicketPriority[]).map(
    (p) => ({ key: p, count: tickets.filter((x) => x.priority === p).length })
  )

  const velocity = sprints.map((s) => ({
    name: s.name,
    points: tickets
      .filter((t) => t.sprintId === s.id && t.status === "DONE")
      .reduce((sum, t) => sum + (t.points ?? 0), 0),
  }))
  const maxVel = Math.max(1, ...velocity.map((v) => v.points))
  const maxType = Math.max(1, ...byType.map((b) => b.count))

  return (
    <Reveal className="grid gap-6 p-4 md:grid-cols-2 md:p-6">
      <ProjectSummary projectId={pid} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4" /> Delivery forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {forecast.etaDate ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Estimated completion</span>
                <span className="text-lg font-semibold">
                  {new Date(forecast.etaDate).toLocaleDateString()}
                </span>
              </div>
              <div className="text-muted-foreground text-xs">
                {forecast.remainingPoints} pts remaining · ~{forecast.avgVelocity} pts/sprint ·{" "}
                {forecast.sprintsRemaining} sprint(s) left
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Not enough velocity history yet (need completed sprints with story points).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sprint burndown{activeSprint ? ` · ${activeSprint.name}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {burndown.length > 0 ? (
            burndown.map((b) => (
              <div key={b.day} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-16">
                  {new Date(b.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${(b.remainingPoints / maxRemain) * 100}%` }} />
                </div>
                <span className="text-muted-foreground w-10 text-right">{b.remainingPoints}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              {activeSprint
                ? "No snapshots yet — schedule a daily POST to /api/sprints/[id]/snapshot."
                : "No active sprint."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Velocity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {velocity.map((v) => (
            <div key={v.name}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{v.name}</span>
                <span className="text-muted-foreground">{v.points} pts</span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${(v.points / maxVel) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {velocity.length === 0 && (
            <p className="text-muted-foreground text-sm">No sprints yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Milestone completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {milestones.map((m) => {
            const pct = m.pct
            return (
              <div key={m.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{m.title}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <Progress value={pct} />
              </div>
            )
          })}
          {milestones.length === 0 && (
            <p className="text-muted-foreground text-sm">No milestones.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tickets by type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {byType.map((b) => (
            <div key={b.key} className="flex items-center gap-2">
              <span className={`w-4 text-center font-bold ${TYPE_META[b.key].color}`}>
                {TYPE_META[b.key].icon}
              </span>
              <span className="w-16 text-xs">{TYPE_META[b.key].label}</span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-foreground/70 h-full"
                  style={{ width: `${(b.count / maxType) * 100}%` }}
                />
              </div>
              <span className="text-muted-foreground w-6 text-right text-xs">
                {b.count}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tickets by priority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {byPriority.map((b) => (
            <div key={b.key} className="flex items-center gap-3">
              <span
                className={`inline-flex w-20 justify-center rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_META[b.key].color}`}
              >
                {PRIORITY_META[b.key].label}
              </span>
              <span className="text-sm">{b.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </Reveal>
  )
}
