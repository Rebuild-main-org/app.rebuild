"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Video } from "lucide-react"
import { toast } from "sonner"

import { useRealtime } from "@/hooks/use-realtime"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Meeting {
  id: string
  title: string
  start: string
  end: string
  meetLink: string
  attendees?: string[]
}

export function MeetingsPanel({ workspaceId }: { workspaceId: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [start, setStart] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/meetings`)
    if (res.ok) setMeetings(await res.json())
  }, [workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useRealtime(useMemo(() => [`ws:${workspaceId}`], [workspaceId]), (e) => {
    if (e.type === "meeting.created") load()
  })

  async function schedule() {
    if (!title.trim() || !start) {
      toast.error("Title and time required")
      return
    }
    setSaving(true)
    const res = await fetch(`/api/workspaces/${workspaceId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, start: new Date(start).toISOString() }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not schedule")
    toast.success("Meeting scheduled with Google Meet link")
    setOpen(false)
    setTitle("")
    setStart("")
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Upcoming meetings</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="size-4" /> Schedule meeting
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule a meeting</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-title">Title</Label>
                <Input
                  id="m-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Sprint review"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-start">When</Label>
                <Input
                  id="m-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                A Google Meet link is generated automatically and all workspace
                members are invited.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={schedule} disabled={saving}>
                Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {meetings.length === 0 && (
        <p className="text-muted-foreground text-sm">No meetings scheduled.</p>
      )}
      {meetings.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-md border p-3">
          <Video className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{m.title}</div>
            <div className="text-muted-foreground text-xs">
              {new Date(m.start).toLocaleString()} ·{" "}
              {m.attendees?.length ?? 0} attendees
            </div>
          </div>
          <a href={m.meetLink} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" className="gap-1.5">
              <Video className="size-3.5" /> Join
            </Button>
          </a>
        </div>
      ))}
    </div>
  )
}
