"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { PROJECT_STATUS_META, type ProjectStatus } from "@/lib/types"
import { ProjectStatusBadge } from "@/components/shared/badges"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUSES = Object.keys(PROJECT_STATUS_META) as ProjectStatus[]

// Editable project status. Read-only badge unless `canEdit`, in which case it's
// a dropdown that PATCHes /api/projects/:id and refreshes.
export function ProjectStatusControl({
  projectId,
  status,
  canEdit,
}: {
  projectId: string
  status: ProjectStatus
  canEdit: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState<ProjectStatus>(status)
  const [saving, setSaving] = useState(false)

  if (!canEdit) return <ProjectStatusBadge status={status} />

  async function change(next: ProjectStatus) {
    if (next === value || saving) return
    const prev = value
    setValue(next)
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    setSaving(false)
    if (!res.ok) {
      setValue(prev)
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Could not update status")
      return
    }
    toast.success(`Status → ${PROJECT_STATUS_META[next].label}`)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted focus-visible:ring-ring inline-flex cursor-pointer items-center gap-1 rounded-full py-0.5 pr-1 pl-0.5 outline-none transition-colors focus-visible:ring-2 disabled:opacity-50"
        disabled={saving}
        aria-label="Change project status"
        title="Change project status"
      >
        <ProjectStatusBadge status={value} />
        {saving ? (
          <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
        ) : (
          <ChevronDown className="text-muted-foreground size-3.5" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => change(s)} className="gap-2">
            <Check className={cn("size-4", s === value ? "opacity-100" : "opacity-0")} />
            <ProjectStatusBadge status={s} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
