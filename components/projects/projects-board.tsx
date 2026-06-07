"use client"

import { useState } from "react"
import Link from "next/link"
import { FolderPlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { ProjectStatus } from "@/lib/types"
import { ProjectStatusBadge } from "@/components/shared/badges"
import { DeleteProjectButton } from "@/components/projects/delete-project-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export interface BoardCard {
  id: string
  name: string
  status: ProjectStatus
  description: string
  groupId: string | null
  ticketCount: number
  progress: number
}
interface Group {
  id: string
  name: string
}

export function ProjectsBoard({
  workspaceId,
  groups: initialGroups,
  cards: initialCards,
  canManage,
  canDelete,
}: {
  workspaceId: string
  groups: Group[]
  cards: BoardCard[]
  canManage: boolean
  canDelete: boolean
}) {
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [cards, setCards] = useState<BoardCard[]>(initialCards)
  const [newGroup, setNewGroup] = useState("")
  const [busy, setBusy] = useState(false)

  async function createGroup() {
    const name = newGroup.trim()
    if (!name) return
    setBusy(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not create group")
    setGroups((g) => [...g, { id: data.id, name: data.name }])
    setNewGroup("")
  }

  async function deleteGroup(gid: string) {
    if (!confirm("Delete this group? Its projects become ungrouped.")) return
    const res = await fetch(`/api/workspaces/${workspaceId}/groups/${gid}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Could not delete group")
    setGroups((g) => g.filter((x) => x.id !== gid))
    setCards((cs) => cs.map((c) => (c.groupId === gid ? { ...c, groupId: null } : c)))
  }

  async function moveProject(projectId: string, groupId: string | null) {
    setCards((cs) => cs.map((c) => (c.id === projectId ? { ...c, groupId } : c)))
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: groupId ?? "" }),
    })
    if (!res.ok) toast.error("Could not move project")
  }

  const sections = [
    ...groups.map((g) => ({ id: g.id, name: g.name, cards: cards.filter((c) => c.groupId === g.id) })),
    { id: null as string | null, name: "Ungrouped", cards: cards.filter((c) => !c.groupId) },
  ].filter((s) => s.id !== null || s.cards.length > 0)

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex items-center gap-2">
          <Input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            placeholder="New group name…"
            className="max-w-xs"
          />
          <Button size="sm" variant="outline" onClick={createGroup} disabled={busy || !newGroup.trim()}>
            <FolderPlus className="size-4" /> Add group
          </Button>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.id ?? "ungrouped"} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{section.name}</h2>
            <span className="text-muted-foreground text-xs">({section.cards.length})</span>
            {canManage && section.id && (
              <button
                onClick={() => deleteGroup(section.id!)}
                className="text-muted-foreground hover:text-destructive"
                title="Delete group"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          {section.cards.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
              No projects in this group.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((c) => (
                <Card key={c.id} className="flex h-full flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/workspace/${workspaceId}/projects/${c.id}/board`} className="hover:underline">
                        <CardTitle className="text-base">{c.name}</CardTitle>
                      </Link>
                      <div className="flex items-center gap-1">
                        <ProjectStatusBadge status={c.status} />
                        {canDelete && <DeleteProjectButton id={c.id} name={c.name} />}
                      </div>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs">{c.description}</p>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{c.ticketCount} tickets</span>
                      <span>{c.progress}%</span>
                    </div>
                    <Progress value={c.progress} />
                    {canManage && (
                      <select
                        value={c.groupId ?? ""}
                        onChange={(e) => moveProject(c.id, e.target.value || null)}
                        className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1 text-xs"
                        aria-label="Move to group"
                      >
                        <option value="">Ungrouped</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
