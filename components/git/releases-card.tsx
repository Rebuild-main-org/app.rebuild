"use client"

import { useCallback, useEffect, useState } from "react"
import { Tag, Loader2, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Release {
  id: number
  tag: string
  name: string
  body: string
  url: string
  publishedAt: string | null
  prerelease: boolean
}

export function ReleasesCard({ workspaceId, canPublish }: { workspaceId: string; canPublish: boolean }) {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState("")
  const [name, setName] = useState("")
  const [body, setBody] = useState("")
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/git/${workspaceId}/releases`)
    if (res.ok) setReleases(await res.json())
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function generate() {
    setGenerating(true)
    const res = await fetch("/api/ai/changelog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wsId: workspaceId }),
    })
    setGenerating(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Changelog failed")
    setBody(d.changelog ?? "")
  }

  async function create() {
    if (!tag.trim()) return toast.error("Tag required (e.g. v1.2.0)")
    setSaving(true)
    const res = await fetch(`/api/git/${workspaceId}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, name, body }),
    })
    setSaving(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Could not create release")
    toast.success(`Release ${tag} published`)
    setOpen(false)
    setTag(""); setName(""); setBody("")
    load()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Tag className="size-4" /> Releases</CardTitle>
          {canPublish && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-3.5" /> New release</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : releases.length === 0 ? (
          <p className="text-muted-foreground text-sm">No releases yet.{canPublish && " Generate a changelog and publish one."}</p>
        ) : (
          releases.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-medium">{r.tag}</code>
                  {r.name && r.name !== r.tag && <span className="text-muted-foreground text-sm">{r.name}</span>}
                  {r.prerelease && <span className="text-amber-600 text-[11px]">pre-release</span>}
                </div>
                <a href={r.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground text-xs">GitHub ↗</a>
              </div>
              {r.body && <p className="text-muted-foreground mt-1 line-clamp-3 text-xs whitespace-pre-wrap">{r.body}</p>}
              {r.publishedAt && <div className="text-muted-foreground mt-1 text-[11px]">{new Date(r.publishedAt).toLocaleDateString()}</div>}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New release</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="r-tag">Tag</Label><Input id="r-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="v1.2.0" /></div>
              <div className="space-y-1.5"><Label htmlFor="r-name">Title</Label><Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="r-body">Release notes</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Generate (AI)
                </Button>
              </div>
              <Textarea id="r-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Generate from merged PRs, or write your own." className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !tag.trim()}>{saving && <Loader2 className="size-4 animate-spin" />} Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
