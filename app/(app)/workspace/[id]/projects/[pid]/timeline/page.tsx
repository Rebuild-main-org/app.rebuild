import { milestoneProgress, milestonesForProject } from "@/lib/queries"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ pid: string }>
}) {
  const { pid } = await params
  const milestonesRaw = await milestonesForProject(pid)
  const milestones = await Promise.all(
    milestonesRaw.map(async (m) => ({
      ...m,
      pct: m.done ? 100 : await milestoneProgress(m.id),
    }))
  )

  if (milestones.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-sm">No milestones yet.</p>
    )
  }

  // Map milestones onto a relative horizontal timeline.
  const now = new Date().getTime()
  const times = milestones.map((m) => new Date(m.dueDate).getTime())
  const min = Math.min(...times, now)
  const max = Math.max(...times, now)
  const span = Math.max(1, max - min)
  const nowPct = ((now - min) / span) * 100

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardContent className="p-6">
          <div className="relative h-2 rounded-full bg-muted">
            <div
              className="bg-primary absolute top-1/2 size-3 -translate-y-1/2 rounded-full ring-2 ring-background"
              style={{ left: `${nowPct}%` }}
              title="Today"
            />
            {milestones.map((m) => {
              const pct = ((new Date(m.dueDate).getTime() - min) / span) * 100
              const overdue = !m.done && new Date(m.dueDate) < new Date()
              return (
                <div
                  key={m.id}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pct}%` }}
                >
                  <div
                    className={`size-3 rounded-full ${
                      m.done
                        ? "bg-emerald-500"
                        : overdue
                          ? "bg-red-500"
                          : "bg-amber-500"
                    }`}
                  />
                </div>
              )
            })}
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-[11px]">
            <span>{new Date(min).toLocaleDateString()}</span>
            <span>{new Date(max).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {milestones.map((m) => {
          const overdue = !m.done && new Date(m.dueDate) < new Date()
          const pct = m.pct
          return (
            <div
              key={m.id}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${
                  m.done
                    ? "bg-emerald-500"
                    : overdue
                      ? "bg-red-500"
                      : "bg-amber-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.title}</span>
                  {m.validatedByClient && (
                    <Badge variant="outline">Client validated</Badge>
                  )}
                  {overdue && <Badge variant="destructive">Overdue</Badge>}
                </div>
                <p className="text-muted-foreground text-sm">{m.description}</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{pct}%</div>
                <div className="text-muted-foreground text-xs">
                  {new Date(m.dueDate).toLocaleDateString()}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
