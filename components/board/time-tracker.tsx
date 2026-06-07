"use client"

// Time tracking panel inside the ticket dialog. Backed by /api/tickets/:id/time.

import { useCallback, useEffect, useState } from "react"
import { Clock, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Entry {
  id: string
  minutes: number
  note?: string
  spentOn: string
  user?: string
}

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`
}

export function TimeTracker({ ticketId }: { ticketId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    const r = await fetch(`/api/tickets/${ticketId}/time`)
    if (r.ok) {
      const d = await r.json()
      setEntries(d.entries)
      setTotal(d.totalMinutes)
    }
  }, [ticketId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Accepts "90", "1h30", "2h", "45m".
  function parseMinutes(s: string): number {
    const t = s.trim().toLowerCase()
    if (/^\d+$/.test(t)) return Number(t)
    const h = /(\d+)\s*h/.exec(t)?.[1]
    const m = /(\d+)\s*m/.exec(t)?.[1]
    return (Number(h ?? 0) * 60) + Number(m ?? 0)
  }

  async function log() {
    const minutes = parseMinutes(amount)
    if (!minutes) return toast.error("Enter time, e.g. 1h30 or 90")
    const r = await fetch(`/api/tickets/${ticketId}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes, note: note.trim() || undefined }),
    })
    if (!r.ok) return toast.error((await r.json()).error ?? "Failed")
    setAmount("")
    setNote("")
    load()
  }

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase">
        <Clock className="size-3.5" /> Time logged
        {total > 0 && <span className="text-foreground normal-case">· {fmt(total)} total</span>}
      </div>
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-sm">
          <span className="font-medium">{fmt(e.minutes)}</span>
          {e.note && <span className="text-muted-foreground truncate">{e.note}</span>}
          <span className="text-muted-foreground ml-auto text-[11px]">
            {e.user} · {new Date(e.spentOn).toLocaleDateString()}
          </span>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1h30" className="h-8 w-24 text-sm" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" className="h-8 flex-1 text-sm" />
        <Button size="icon" variant="outline" className="size-8" onClick={log} disabled={!amount.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}
