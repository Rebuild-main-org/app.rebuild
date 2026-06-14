"use client"

import { useState } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type {
  StoryPoints,
  Ticket,
  TicketPriority,
  TicketStatus,
  TicketType,
  User,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AiFeedback } from "@/components/ai/ai-feedback"

const TYPES: TicketType[] = ["TASK", "BUG", "FEATURE", "REVIEW", "EPIC", "SPIKE"]
const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
const POINTS: StoryPoints[] = [1, 2, 3, 5, 8, 13]

export function CreateTicketDialog({
  projectId,
  users,
  defaultStatus,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string
  users: Pick<User, "id" | "name">[]
  defaultStatus: TicketStatus
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (ticket: Ticket) => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<TicketType>("TASK")
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM")
  const [assigneeId, setAssigneeId] = useState<string>("none")
  const [points, setPoints] = useState<string>("none")
  const [saving, setSaving] = useState(false)
  const [triaging, setTriaging] = useState(false)
  const [triageTraceId, setTriageTraceId] = useState<string | undefined>()

  async function triage() {
    if (!title.trim()) return toast.error("Add a title first")
    setTriaging(true)
    try {
      const res = await fetch("/api/ai/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title, description }),
      })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error ?? "Triage failed")
      setType(data.type)
      setPriority(data.priority)
      if (data.suggestedAssigneeId) setAssigneeId(data.suggestedAssigneeId)
      setTriageTraceId(data.traceId)
      toast.success(`AI: ${data.type} · ${data.priority} — ${data.reason}`)
    } finally {
      setTriaging(false)
    }
  }

  function reset() {
    setTitle("")
    setDescription("")
    setType("TASK")
    setPriority("MEDIUM")
    setAssigneeId("none")
    setPoints("none")
  }

  async function submit() {
    if (!title.trim()) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        type,
        priority,
        status: defaultStatus,
        assigneeId: assigneeId === "none" ? undefined : assigneeId,
        points: points === "none" ? undefined : Number(points),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      toast.error("Could not create ticket")
      return
    }
    const ticket = (await res.json()) as Ticket
    toast.success(`${ticket.shortId} created`)
    onCreated(ticket)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>
            Adds to the {defaultStatus.replace("_", " ").toLowerCase()} column.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              autoFocus
              placeholder="Short, actionable summary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              placeholder="Markdown supported"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={triaging || !title.trim()}
              onClick={triage}
            >
              {triaging ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              AI triage
            </Button>
            {triageTraceId && <AiFeedback traceId={triageTraceId} feature="triage" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TicketPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Story points</Label>
              <Select value={points} onValueChange={setPoints}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {POINTS.map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !title.trim()}>
            Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
