import { notFound } from "next/navigation"
import { CalendarClock, Flag, Rocket, Ticket as TicketIcon } from "lucide-react"

import {
  getWorkspace,
  milestonesForWorkspace,
  sprintsForProject,
  ticketsForWorkspace,
} from "@/lib/queries"
import { MeetingsPanel } from "@/components/calendar/meetings-panel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AgendaItem {
  date: string
  label: string
  kind: "ticket" | "sprint" | "milestone"
}

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()

  const [tickets, milestones] = await Promise.all([
    ticketsForWorkspace(id),
    milestonesForWorkspace(id),
  ])
  const projectIds = [...new Set(tickets.map((t) => t.projectId))]
  const sprintLists = await Promise.all(projectIds.map((pid) => sprintsForProject(pid)))
  const sprints = sprintLists.flat()

  const items: AgendaItem[] = []
  for (const t of tickets) {
    if (t.dueDate && t.status !== "DONE")
      items.push({ date: t.dueDate, label: `${t.shortId} due — ${t.title}`, kind: "ticket" })
  }
  for (const s of sprints) {
    items.push({ date: s.endDate, label: `Sprint ends — ${s.name}`, kind: "sprint" })
  }
  for (const m of milestones) {
    if (!m.done)
      items.push({ date: m.dueDate, label: `Milestone — ${m.title}`, kind: "milestone" })
  }
  items.sort((a, b) => a.date.localeCompare(b.date))

  const Icon = { ticket: TicketIcon, sprint: CalendarClock, milestone: Flag }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-muted-foreground text-sm">
          Deadlines, sprints, milestones and meetings for {ws.name}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" /> Agenda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.length === 0 && (
              <p className="text-muted-foreground text-sm">Nothing scheduled.</p>
            )}
            {items.map((it, i) => {
              const ItemIcon = Icon[it.kind] ?? Rocket
              const overdue = new Date(it.date) < new Date()
              return (
                <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                  <ItemIcon className="text-muted-foreground size-4 shrink-0" />
                  <span className="flex-1 text-sm">{it.label}</span>
                  <span
                    className={`text-xs ${overdue ? "text-red-500" : "text-muted-foreground"}`}
                  >
                    {new Date(it.date).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Meetings &amp; Meet</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingsPanel workspaceId={id} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
