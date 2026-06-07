"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete project "${name}"? This removes its sprints, milestones and tickets.`)) return
    setBusy(true)
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return toast.error(d.error ?? "Could not delete project")
    }
    toast.success(`Project "${name}" deleted`)
    router.refresh()
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      title="Delete project"
      className="text-muted-foreground hover:text-destructive rounded-md p-1"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  )
}
