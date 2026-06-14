"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2, AlertTriangle, MoreVertical } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function DeleteWorkspaceButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteRepo, setDeleteRepo] = useState(true)

  // Rendered inside a <Link> card — stop the click from navigating.
  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function confirmDelete() {
    setBusy(true)
    const res = await fetch(`/api/workspaces/${id}?deleteRepo=${deleteRepo ? "1" : "0"}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return toast.error(d.error ?? "Could not delete workspace")
    }
    const data = await res.json().catch(() => ({}))
    setOpen(false)
    if (deleteRepo && data.repo && !data.repo.deleted) {
      toast.warning(`Workspace deleted, but the GitHub repo wasn't: ${data.repo.error ?? "unknown"}`)
    } else if (deleteRepo && data.repo?.deleted) {
      toast.success(`Workspace "${name}" and its GitHub repo deleted`)
    } else {
      toast.success(`Workspace "${name}" deleted`)
    }
    router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={stop}>
          <button
            title="Workspace actions"
            aria-label="Workspace actions"
            className="text-muted-foreground hover:text-foreground rounded-md p-1"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stop}>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setOpen(true)}
          >
            <Trash2 className="size-4" /> Delete workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive size-5" /> Delete workspace
            </DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{name}</strong> and all its projects, tickets,
              git data, documents and members. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <Checkbox checked={deleteRepo} onCheckedChange={(v) => setDeleteRepo(!!v)} className="mt-0.5" />
            <span>
              Also <strong>permanently delete the associated GitHub repository</strong>.
              <span className="text-muted-foreground block text-xs">
                Requires a token with <code>delete_repo</code> scope. Uncheck to keep the repo.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deleteRepo ? "Delete workspace + repo" : "Delete workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
