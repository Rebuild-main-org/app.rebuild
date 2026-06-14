"use client"

import { useCallback, useEffect, useState } from "react"
import { Bot, Plus, Trash2, Loader2, Save, FileText } from "lucide-react"
import { toast } from "sonner"

import { AGENT_FILE_KINDS, type Agent, type AgentFile, type AgentFileKind } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export function AgentsManager() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [files, setFiles] = useState<AgentFile[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agents")
      if (!res.ok) {
        setErrorMsg((await res.json().catch(() => ({}))).error ?? "Failed to load")
        setState("error")
        return
      }
      setAgents(await res.json())
      setState("ready")
    } catch {
      // A thrown fetch (network/timeout) otherwise left this on "Loading agents…" forever.
      setErrorMsg("Couldn't reach the server.")
      setState("error")
    }
  }, [])

  const loadFiles = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/agents/${id}`)
    if (res.ok) setFiles((await res.json()).files ?? [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAgents()
  }, [loadAgents])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeId) loadFiles(activeId)
    else setFiles([])
  }, [activeId, loadFiles])

  const active = agents.find((a) => a.id === activeId) ?? null

  async function createAgent(name: string, description: string) {
    const res = await fetch("/api/admin/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Could not create")
    toast.success("Agent created")
    await loadAgents()
    setActiveId(d.id)
  }
  async function deleteAgent(id: string) {
    if (!confirm("Delete this agent and all its files?")) return
    const res = await fetch(`/api/admin/agents/${id}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Could not delete")
    toast.success("Agent deleted")
    if (activeId === id) setActiveId(null)
    loadAgents()
  }
  async function saveFile(name: string, kind: AgentFileKind, content: string) {
    if (!activeId) return
    const res = await fetch(`/api/admin/agents/${activeId}/files`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, content }),
    })
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not save")
    toast.success(`${name} saved`)
    loadFiles(activeId)
    loadAgents()
  }
  async function deleteFile(name: string) {
    if (!activeId || !confirm(`Delete ${name}?`)) return
    const res = await fetch(`/api/admin/agents/${activeId}/files?name=${encodeURIComponent(name)}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Could not delete")
    loadFiles(activeId)
    loadAgents()
  }

  if (state === "loading") return <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm"><Loader2 className="size-4 animate-spin" /> Loading agents…</div>
  if (state === "error") return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
      {errorMsg}
      <div className="text-muted-foreground mt-1 text-xs">Run <code>supabase/agents.sql</code> to create the agents tables.</div>
      <button onClick={() => { setState("loading"); loadAgents() }} className="text-foreground/80 hover:text-foreground mt-2 text-xs underline">Retry</button>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Build reusable AI agents: each is a bundle of files (soul.md, skills.md, UI templates, languages,
        rules, knowledge…). Workspaces pick an agent; rebuild216 injects its files on connect.
      </p>
      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        {/* Agents list */}
        <div className="space-y-2">
          <NewAgentDialog onCreate={createAgent} />
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                className={cn("hover:bg-muted/60 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm", activeId === a.id && "bg-muted border-primary/40")}
              >
                <Bot className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-muted-foreground text-[11px]">{a.fileCount ?? 0}</span>
              </button>
            ))}
            {agents.length === 0 && <p className="text-muted-foreground px-1 text-xs">No agents yet.</p>}
          </div>
        </div>

        {/* Selected agent files */}
        <div className="min-w-0">
          {!active ? (
            <div className="text-muted-foreground flex h-full items-center justify-center rounded-md border border-dashed p-8 text-sm">
              Select or create an agent.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{active.name}</h3>
                  {active.description && <p className="text-muted-foreground text-xs">{active.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <NewFileDialog onSave={saveFile} />
                  <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={() => deleteAgent(active.id)} title="Delete agent"><Trash2 className="size-4" /></Button>
                </div>
              </div>
              {files.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
                  No files. Add soul.md, skills.md, UI templates, languages, rules…
                </p>
              ) : (
                <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                  {files.map((f) => (
                    <FileEditor key={f.id} file={f} onSave={saveFile} onDelete={deleteFile} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NewAgentDialog({ onCreate }: { onCreate: (name: string, description: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="w-full gap-1.5"><Plus className="size-4" /> New agent</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New agent</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="ag-name">Name</Label><Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Backend Agent" /></div>
          <div className="space-y-1.5"><Label htmlFor="ag-desc">Description</Label><Input id="ag-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this agent is for" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { if (name.trim()) { onCreate(name, desc); setOpen(false); setName(""); setDesc("") } }} disabled={!name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewFileDialog({ onSave }: { onSave: (name: string, kind: AgentFileKind, content: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<AgentFileKind>("knowledge")
  const [content, setContent] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Plus className="size-4" /> New file</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New file</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>File name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="soul.md / ui/dashboard.md" /></div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AgentFileKind)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{AGENT_FILE_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} placeholder="Markdown content…" className="font-mono text-xs" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { if (name.trim()) { onSave(name, kind, content); setOpen(false); setName(""); setContent("") } }} disabled={!name.trim()}>Add file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FileEditor({
  file, onSave, onDelete,
}: {
  file: AgentFile
  onSave: (name: string, kind: AgentFileKind, content: string) => void
  onDelete: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState(file.content)
  const [kind, setKind] = useState<AgentFileKind>(file.kind)
  const [saving, setSaving] = useState(false)
  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <FileText className="text-muted-foreground size-4 shrink-0" />
        <code className="min-w-0 flex-1 truncate text-sm">{file.name}</code>
        <Badge variant="outline" className="text-[10px]">{file.kind}</Badge>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</Button>
        <Button variant="ghost" size="icon" className="text-destructive size-7" onClick={() => onDelete(file.name)} title="Delete"><Trash2 className="size-3.5" /></Button>
      </div>
      {open && (
        <div className="space-y-2 border-t p-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Kind</span>
            <Select value={kind} onValueChange={(v) => setKind(v as AgentFileKind)}>
              <SelectTrigger size="sm" className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{AGENT_FILE_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="font-mono text-xs" />
          <div className="flex justify-end">
            <Button size="sm" disabled={saving} onClick={async () => { setSaving(true); await onSave(file.name, kind, content); setSaving(false) }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
