"use client"

// Import an architecture.md and let Claude scaffold the project(s) + To-Do
// backlog for this workspace. POSTs to /api/workspaces/:id/scaffold.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileUp, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface PlanTicket { title: string; type: string; priority: string; points: number | null; subtasks?: string[] }
interface Plan { projects: { name: string; shortCode: string; description: string; tickets: PlanTicket[] }[] }

export function ArchitectureImport({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState("")
  const [fileName, setFileName] = useState("")
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)

  async function onFile(file: File) {
    const text = await file.text()
    setContent(text)
    setFileName(file.name)
  }

  // Step 1 — generate a plan and show it for approval (no creation yet).
  async function preview() {
    if (content.trim().length < 30) return toast.error("Add the architecture document first")
    setBusy(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/scaffold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, preview: true }),
      })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error ?? "Planning failed")
      setPlan(data.preview as Plan)
    } finally {
      setBusy(false)
    }
  }

  // Step 2 — create from the approved plan (no second AI call).
  async function create() {
    if (!plan) return
    setBusy(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/scaffold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error ?? "Scaffold failed")
      toast.success(
        `Created ${data.projects} project(s), ${data.tickets} tickets, ${data.subtasks ?? 0} sub-tasks, ${data.links ?? 0} links`
      )
      setOpen(false)
      setContent("")
      setFileName("")
      setPlan(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileUp className="size-4" /> Import architecture.md
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> Scaffold from architecture
            </DialogTitle>
            <DialogDescription>
              Upload (or paste) your architecture.md. Claude will create the project(s)
              and a To-Do backlog for this workspace.
            </DialogDescription>
          </DialogHeader>

          {!plan ? (
            <div className="space-y-3">
              <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm">
                <FileUp className="text-muted-foreground size-4" />
                <span className="text-muted-foreground">
                  {fileName || "Choose a .md / .txt file"}
                </span>
                <input
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  hidden
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="…or paste the document contents here"
                rows={10}
                className="font-mono text-xs"
              />
              <Button onClick={preview} disabled={busy || content.trim().length < 30} className="w-full gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy ? "Generating plan…" : "Preview plan"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Review the plan before creating. Nothing is created until you confirm.
              </p>
              <div className="max-h-[45vh] space-y-3 overflow-y-auto">
                {plan.projects.map((p) => (
                  <div key={p.shortCode} className="rounded-md border p-3">
                    <div className="text-sm font-medium">
                      {p.name} <span className="text-muted-foreground font-mono text-xs">({p.shortCode})</span>{" "}
                      <span className="text-muted-foreground text-xs">· {p.tickets.length} tickets</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {p.tickets.map((t, i) => (
                        <li key={i} className="text-xs">
                          <span className="text-muted-foreground font-mono">{t.type}/{t.priority}{t.points ? `/${t.points}` : ""}</span>{" "}
                          {t.title}
                          {t.subtasks && t.subtasks.length > 0 && (
                            <span className="text-muted-foreground"> · {t.subtasks.length} sous-tâches</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPlan(null)} disabled={busy} className="flex-1">
                  Back
                </Button>
                <Button onClick={create} disabled={busy} className="flex-1 gap-2">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {busy ? "Creating…" : "Create projects & backlog"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
