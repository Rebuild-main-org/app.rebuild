"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface AgentOpt { id: string; name: string; description: string }

// Select one or more AI agents (from the Super Admin library) for this
// workspace. rebuild216 injects every selected agent's files when connecting.
export function AgentSelector({ workspaceId }: { workspaceId: string }) {
  const [agents, setAgents] = useState<AgentOpt[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent`)
      if (!res.ok) throw new Error(String(res.status))
      const d = await res.json()
      setAgents(d.agents ?? [])
      setSelected(d.agentIds ?? [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function save(next: string[]) {
    setSelected(next)
    setSaving(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/agent`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentIds: next }),
    })
    setSaving(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not save")
    toast.success("Agents updated — injected on the next rebuild216 connection")
  }

  const add = (id: string) => { if (id && !selected.includes(id)) save([...selected, id]) }
  const remove = (id: string) => save(selected.filter((x) => x !== id))

  if (loading) return <div className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</div>
  if (error) return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <X className="size-4 text-red-500" /> Couldn&apos;t load agents.
      <button onClick={load} className="hover:text-foreground underline">Retry</button>
    </div>
  )

  const available = agents.filter((a) => !selected.includes(a.id))
  const byId = new Map(agents.map((a) => [a.id, a]))

  return (
    <div className="space-y-3">
      {/* Selected agents as chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.length === 0 && <span className="text-muted-foreground text-sm">No agents — global defaults are used.</span>}
        {selected.map((id) => (
          <Badge key={id} variant="secondary" className="gap-1 py-1 pr-1">
            <Bot className="size-3.5" /> {byId.get(id)?.name ?? id}
            <button onClick={() => remove(id)} className="hover:bg-background/60 rounded p-0.5" aria-label="Remove">
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {saving && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      </div>

      {/* Add another agent */}
      <Select value="" onValueChange={add} disabled={available.length === 0}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder={available.length ? "+ Add an agent" : "All agents added"} />
        </SelectTrigger>
        <SelectContent>
          {available.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {agents.length === 0 && <p className="text-muted-foreground text-xs">No agents in the library yet — a Super Admin can create them in the Admin panel.</p>}
      {selected.length > 1 && <p className="text-muted-foreground text-xs">All selected agents&apos; files are injected (each under <code>.rebuild/agent/&lt;name&gt;/</code>).</p>}
    </div>
  )
}
