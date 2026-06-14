import { getT } from "@/lib/i18n-server"
import { redirect } from "next/navigation"
import { Activity, CheckCircle2, Clock, Gauge, Users } from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { analytics, doraMetrics } from "@/lib/analytics"
import { UserAvatar } from "@/components/shared/badges"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function AnalyticsPage() {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "analytics"))) redirect("/dashboard")

  const [{ global: g, engineers, workspaces }, dora] = await Promise.all([
    analytics(),
    doraMetrics(),
  ])

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Analytics")}</h1>
        <p className="text-muted-foreground text-sm">
          Delivery health across the team ({user.role.toLowerCase()} view).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4" /> DORA metrics
            <span className="text-muted-foreground text-xs font-normal">
              · last {dora.windowDays} days · {dora.prodDeploys} prod deploys
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Activity className="size-4" />} label="Deploy frequency" value={`${dora.deployFrequencyPerWeek}/wk`} />
          <Kpi icon={<Clock className="size-4" />} label="Lead time" value={dora.leadTimeHours == null ? "—" : `${dora.leadTimeHours}h`} hint="commit → prod" />
          <Kpi icon={<Activity className="size-4" />} label="Change failure rate" value={`${dora.changeFailureRate}%`} />
          <Kpi icon={<Clock className="size-4" />} label="MTTR" value={dora.mttrHours == null ? "—" : `${dora.mttrHours}h`} hint="time to restore" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Activity className="size-4" />} label="Active workspaces" value={`${g.activeWorkspaces}`} />
        <Kpi icon={<Activity className="size-4" />} label="Active projects" value={`${g.activeProjects}`} />
        <Kpi icon={<Users className="size-4" />} label="Load / engineer" value={`${g.loadPerEngineer}`} hint="open tickets" />
        <Kpi icon={<Clock className="size-4" />} label="On-time delivery" value={`${g.onTimeRate}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4" /> Created vs resolved (this week)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Bar label="Created" value={g.createdThisWeek} max={Math.max(g.createdThisWeek, g.resolvedThisWeek, 1)} tone="bg-blue-500" />
          <Bar label="Resolved" value={g.resolvedThisWeek} max={Math.max(g.createdThisWeek, g.resolvedThisWeek, 1)} tone="bg-emerald-500" />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Per engineer</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engineer</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Done</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-6 text-center text-sm">
                      No assigned tickets yet — engineer stats appear once work is assigned.
                    </TableCell>
                  </TableRow>
                )}
                {engineers.map((e) => (
                  <TableRow key={e.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={e.name} />
                        <span className="text-sm">{e.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{e.assigned}</TableCell>
                    <TableCell className="text-right">{e.completed}</TableCell>
                    <TableCell className="text-right">{e.open}</TableCell>
                    <TableCell className="text-right font-medium">{e.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Per workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">Bugs</TableHead>
                  <TableHead className="text-right">Features</TableHead>
                  <TableHead className="text-right">Velocity</TableHead>
                  <TableHead className="text-right">Late MS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-6 text-center text-sm">
                      No active workspaces yet.
                    </TableCell>
                  </TableRow>
                )}
                {workspaces.map((w) => (
                  <TableRow key={w.workspaceId}>
                    <TableCell className="text-sm font-medium">{w.name}</TableCell>
                    <TableCell className="text-right">{w.bugs}</TableCell>
                    <TableCell className="text-right">{w.features}</TableCell>
                    <TableCell className="text-right">{w.velocity}</TableCell>
                    <TableCell className="text-right">
                      <span className={w.milestonesLate > 0 ? "text-red-500" : ""}>
                        {w.milestonesLate}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {icon} {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: string
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div className={`h-full ${tone}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  )
}
