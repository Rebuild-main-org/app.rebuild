"use client"

import { useState } from "react"
import { GitCommitHorizontal } from "lucide-react"
import { toast } from "sonner"

import { FILE_STATUS_META, type FileStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

export function CommitDialog({
  workspaceId,
  branch,
  changes,
  activeTicket,
  onCommit,
  onCommitted,
}: {
  workspaceId: string
  branch: string
  changes: { path: string; status: FileStatus }[]
  activeTicket?: string
  onCommit?: (message: string) => Promise<boolean>
  onCommitted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  function openDialog(next: boolean) {
    if (next && activeTicket && !message) {
      // Prefill with the active ticket reference (spec: link commit to ticket).
      setMessage(`: ${"" /* describe */} [${activeTicket}]`)
    }
    setOpen(next)
  }

  async function commit() {
    if (!message.trim()) return
    setSaving(true)
    // GitHub-backed mode: commit dirty files directly via the Contents API.
    if (onCommit) {
      const ok = await onCommit(message.trim())
      setSaving(false)
      if (!ok) return
      setMessage("")
      setOpen(false)
      onCommitted()
      return
    }
    const res = await fetch(`/api/git/${workspaceId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim(), branch }),
    })
    setSaving(false)
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      toast.error(error ?? "Commit failed")
      return
    }
    const commit = await res.json()
    toast.success(`Committed ${commit.hash}`)
    setMessage("")
    setOpen(false)
    onCommitted()
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <GitCommitHorizontal className="size-4" />
          Commit
          {changes.length > 0 && (
            <span className="bg-primary-foreground/20 rounded-full px-1.5 text-xs">
              {changes.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>
            {changes.length} file{changes.length === 1 ? "" : "s"} on{" "}
            <code className="text-xs">{branch}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
            {changes.map((c) => (
              <div key={c.path} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "w-3 text-center text-xs font-bold",
                    FILE_STATUS_META[c.status].color
                  )}
                >
                  {FILE_STATUS_META[c.status].letter}
                </span>
                <span className="font-mono text-xs">{c.path}</span>
              </div>
            ))}
          </div>
          <Textarea
            autoFocus
            placeholder="Commit message — reference a ticket like [ACME-142]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
          <p className="text-muted-foreground text-xs">
            Referencing a ticket ID links this commit to it automatically.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={saving || !message.trim()}>
            Commit &amp; push
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
