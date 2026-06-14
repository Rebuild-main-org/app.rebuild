"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface CalendarItem {
  date: string
  label: string
  kind: "ticket" | "sprint" | "milestone"
}

const KIND_DOT: Record<CalendarItem["kind"], string> = {
  ticket: "bg-sky-500",
  sprint: "bg-violet-500",
  milestone: "bg-amber-500",
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// Local YYYY-M-D key (avoids UTC off-by-one when bucketing dated items).
function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Month view of deadlines, sprint ends and milestones. Complements the agenda
// list below it — this gives the at-a-glance "what's coming this month" view.
export function MonthGrid({ items }: { items: CalendarItem[] }) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of items) {
      const d = new Date(it.date)
      if (Number.isNaN(d.getTime())) continue
      const k = dayKey(d)
      const arr = map.get(k)
      if (arr) arr.push(it)
      else map.set(k, [it])
    }
    return map
  }, [items])

  // Build a 6-week grid starting on the Monday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7 // Mon=0 … Sun=6
    const start = new Date(first)
    start.setDate(first.getDate() - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const todayKey = dayKey(today)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-muted-foreground bg-muted/40 border-b px-2 py-1.5 text-center text-[11px] font-medium"
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth()
          const key = dayKey(d)
          const dayItems = byDay.get(key) ?? []
          const isToday = key === todayKey
          return (
            <div
              key={i}
              className={cn(
                "min-h-[68px] border-b border-r p-1 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/20 text-muted-foreground/50"
              )}
            >
              <div
                className={cn(
                  "mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                  isToday && "bg-primary text-primary-foreground font-semibold"
                )}
              >
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayItems.slice(0, 2).map((it, j) => (
                  <div
                    key={j}
                    title={it.label}
                    className="flex items-center gap-1 truncate text-[10px] leading-tight"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[it.kind])} />
                    <span className="truncate">{it.label}</span>
                  </div>
                ))}
                {dayItems.length > 2 && (
                  <div className="text-muted-foreground text-[10px]">+{dayItems.length - 2} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-[11px]">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-500" /> Ticket due</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-violet-500" /> Sprint end</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Milestone</span>
      </div>
    </div>
  )
}
