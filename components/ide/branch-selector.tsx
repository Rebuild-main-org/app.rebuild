"use client"

import { useState } from "react"
import { GitBranch, Lock, Plus } from "lucide-react"
import { toast } from "sonner"

import type { Branch } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function BranchSelector({
  workspaceId,
  branches,
  current,
  suggestedName,
  onChange,
  onBranchesChanged,
}: {
  workspaceId: string
  branches: Branch[]
  current: string
  suggestedName?: string
  onChange: (name: string) => void
  onBranchesChanged: (branches: Branch[]) => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState(suggestedName ?? "")

  async function createBranch() {
    if (!name.trim()) return
    const res = await fetch(`/api/git/${workspaceId}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      toast.error(error ?? "Could not create branch")
      return
    }
    const created = (await res.json()) as Branch
    onBranchesChanged([...branches, created])
    onChange(created.name)
    setCreating(false)
    toast.success(`Created ${created.name}`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <GitBranch className="size-3.5" />
            <span className="max-w-48 truncate">{current}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {branches.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => onChange(b.name)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-1.5 truncate">
                {b.protected && <Lock className="size-3 shrink-0" />}
                <span className="truncate">{b.name}</span>
              </span>
              {(b.ahead > 0 || b.behind > 0) && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  ↑{b.ahead} ↓{b.behind}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setName(suggestedName ?? "")
              setCreating(true)
            }}
          >
            <Plus className="size-4" /> New branch…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              autoFocus
              placeholder="feature/ACME-142-login"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {suggestedName && (
              <p className="text-muted-foreground text-xs">
                Suggested from the active ticket.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={createBranch} disabled={!name.trim()}>
              Create branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
