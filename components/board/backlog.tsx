"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

import type { Sprint, Ticket } from "@/lib/types"
import { PriorityBadge, StatusBadge, TypeIcon } from "@/components/shared/badges"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Backlog & sprint planning: drag-free assignment of tickets to sprints, with
// committed vs completed story points per sprint (Jira-style backlog).
export function Backlog({
  initialTickets,
  sprints,
}: {
  initialTickets: Ticket[]
  sprints: Sprint[]
}) {
  const [tickets, setTickets] = useState(initialTickets)

  const points = (ts: Ticket[]) => ts.reduce((s, t) => s + (t.points ?? 0), 0)
  const groups = useMemo(() => {
    const bySprint = new Map<string, Ticket[]>()
    const backlog: Ticket[] = []
    for (const t of tickets) {
      if (t.sprintId) {
        if (!bySprint.has(t.sprintId)) bySprint.set(t.sprintId, [])
        bySprint.get(t.sprintId)!.push(t)
      } else backlog.push(t)
    }
    return { bySprint, backlog }
  }, [tickets])

  async function assign(ticketId: string, sprintId: string | null) {
    setTickets((ts) => ts.map((t) => (t.id === ticketId ? { ...t, sprintId: sprintId ?? undefined } : t)))
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprintId: sprintId }),
    })
    if (!res.ok) toast.error("Could not move ticket")
  }

  function Row({ t }: { t: Ticket }) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
        <TypeIcon type={t.type} />
        <span className="text-muted-foreground font-mono text-[11px]">{t.shortId}</span>
        <span className="min-w-0 flex-1 truncate">{t.title}</span>
        <PriorityBadge priority={t.priority} />
        <StatusBadge status={t.status} />
        {t.points != null && <span className="text-muted-foreground text-[11px]">{t.points}p</span>}
        <Select value={t.sprintId ?? "backlog"} onValueChange={(v) => assign(t.id, v === "backlog" ? null : v)}>
          <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="backlog">Backlog</SelectItem>
            {sprints.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      {sprints.map((s) => {
        const items = groups.bySprint.get(s.id) ?? []
        const committed = points(items)
        const done = points(items.filter((t) => t.status === "DONE"))
        const active = s.status === "ACTIVE"
        return (
          <div key={s.id} className="rounded-lg border">
            <div className="bg-muted/40 flex items-center justify-between rounded-t-lg px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.name}</span>
                {active && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">ACTIVE</span>}
                <span className="text-muted-foreground text-xs">{s.goal}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                {items.length} tickets · {done}/{committed} pts
              </div>
            </div>
            <div className="space-y-1.5 p-3">
              {items.length === 0 ? (
                <p className="text-muted-foreground py-2 text-center text-xs">Empty sprint</p>
              ) : (
                items.map((t) => <Row key={t.id} t={t} />)
              )}
            </div>
          </div>
        )
      })}

      <div className="rounded-lg border">
        <div className="bg-muted/40 flex items-center justify-between rounded-t-lg px-4 py-2.5">
          <span className="text-sm font-medium">Backlog</span>
          <span className="text-muted-foreground text-xs">
            {groups.backlog.length} tickets · {points(groups.backlog)} pts
          </span>
        </div>
        <div className="space-y-1.5 p-3">
          {groups.backlog.length === 0 ? (
            <p className="text-muted-foreground py-2 text-center text-xs">Backlog is empty</p>
          ) : (
            groups.backlog.map((t) => <Row key={t.id} t={t} />)
          )}
        </div>
      </div>
    </div>
  )
}
