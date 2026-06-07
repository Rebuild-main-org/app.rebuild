"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GitBranch, Loader2, Trash2, Brush } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Toolbar: create a branch + clean up merged branches.
export function BranchTools({ workspaceId, suggestedName }: { workspaceId: string; suggestedName?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(suggestedName ?? "")
  const [busy, setBusy] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    const res = await fetch(`/api/git/${workspaceId}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not create branch")
    toast.success(`Branch ${name.trim()} created`)
    setOpen(false)
    setName("")
    router.refresh()
  }

  async function cleanup() {
    if (!confirm("Delete the source branches of all merged PRs?")) return
    setCleaning(true)
    const res = await fetch(`/api/git/${workspaceId}/branches/cleanup`, { method: "POST" })
    setCleaning(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Cleanup failed")
    toast.success(`Deleted ${d.deleted ?? 0} merged branch(es)`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={cleanup} disabled={cleaning}>
        {cleaning ? <Loader2 className="size-3.5 animate-spin" /> : <Brush className="size-3.5" />} Delete merged
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs"><GitBranch className="size-3.5" /> New branch</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>New branch</DialogTitle></DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/ACME-142-login" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !name.trim()}>{busy && <Loader2 className="size-4 animate-spin" />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Per-branch delete (hidden for the default branch).
export function DeleteBranchButton({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!confirm(`Delete branch "${name}"?`)) return
    setBusy(true)
    const res = await fetch(`/api/git/${workspaceId}/branches`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    setBusy(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not delete")
    toast.success(`Branch ${name} deleted`)
    router.refresh()
  }
  return (
    <button onClick={del} disabled={busy} title="Delete branch" className="text-muted-foreground hover:text-destructive">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  )
}
