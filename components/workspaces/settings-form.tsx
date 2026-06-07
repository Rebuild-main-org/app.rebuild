"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { Workspace, WorkspaceStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUSES: WorkspaceStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"]

export function WorkspaceSettingsForm({ workspace }: { workspace: Workspace }) {
  const router = useRouter()
  const [name, setName] = useState(workspace.name)
  const [repo, setRepo] = useState(workspace.githubRepo)
  const [status, setStatus] = useState<WorkspaceStatus>(workspace.status)
  const [tech, setTech] = useState((workspace.technologies ?? []).join(", "))
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  async function seedCi() {
    setSeeding(true)
    const res = await fetch(`/api/workspaces/${workspace.id}/seed-ci`, { method: "POST" })
    setSeeding(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error ?? "Could not add the CI workflow")
      return
    }
    toast.success("Default CI workflow written to the repo (.github/workflows/ci.yml)")
  }

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        githubRepo: repo,
        status,
        technologies: tech.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toast.error("Could not save")
      return
    }
    const data = await res.json().catch(() => ({}))
    const repoInfo = data?.repo as
      | { existed: boolean; created: boolean; fullName?: string; error?: string }
      | undefined
    if (repoInfo?.created) toast.success(`GitHub repo created: ${repoInfo.fullName ?? repo}`)
    else if (repoInfo?.error) toast.warning(`Workspace saved, but repo: ${repoInfo.error}`)
    else if (repoInfo?.existed && repoInfo.fullName && repoInfo.fullName !== repo)
      toast.success(`Linked to ${repoInfo.fullName}`)
    else toast.success("Workspace updated")
    router.refresh()
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="repo">GitHub repo</Label>
        <Input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" />
        <p className="text-muted-foreground text-xs">
          Format <code>owner/repo</code>. If it doesn&apos;t exist on GitHub, it&apos;s created
          automatically (private) when you save.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={seedCi}
          disabled={seeding || !repo}
        >
          {seeding ? "Adding…" : "Add default CI workflow"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Writes (or resets) <code>.github/workflows/ci.yml</code> — install → typecheck → test →
          build. New project repos get this automatically; use this to add it to an existing repo.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as WorkspaceStatus)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tech">Technologies (stack technique)</Label>
        <Input
          id="tech"
          value={tech}
          onChange={(e) => setTech(e.target.value)}
          placeholder="e.g. Next.js, Supabase, TypeScript, Tailwind"
        />
        <p className="text-muted-foreground text-xs">
          Liste séparée par des virgules. Alimente la « Stack technique » du dashboard.
        </p>
      </div>
      <Button onClick={save} disabled={saving}>
        Save changes
      </Button>
    </div>
  )
}
