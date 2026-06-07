"use client"

// Support tickets. Everyone can open a ticket and discuss it; only a SUPER_ADMIN
// can change its status (treat it). Each ticket has a discussion thread, and the
// requester is notified when it's resolved. Backed by /api/support.

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Clock, Loader2, MessageSquare, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  SUPPORT_STATUS_META,
  PRIORITY_META,
  type SupportComment,
  type SupportStatus,
  type TicketPriority,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SupportRow {
  id: string
  subject: string
  body: string
  requesterEmail: string
  requesterId?: string
  status: SupportStatus
  priority: TicketPriority
  slaDueAt?: string
  assignee?: string
  createdAt: string
}

const STATUSES: SupportStatus[] = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"]
const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

function sla(due?: string) {
  if (!due) return null
  const ms = new Date(due).getTime() - Date.now()
  const overdue = ms < 0
  const hrs = Math.round(Math.abs(ms) / 3_600_000)
  return { overdue, label: overdue ? `${hrs}h overdue` : `${hrs}h left` }
}

export function SupportView({
  initial,
  canResolve,
  isStaff,
}: {
  initial: SupportRow[]
  canResolve: boolean
  isStaff: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [rows, setRows] = useState(initial)
  const [filter, setFilter] = useState<SupportStatus | "ALL">("ALL")
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM")
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter)
  const active = rows.find((r) => r.id === activeId) ?? null

  // Deep link from a notification: /support?ticket=<id>
  useEffect(() => {
    const t = params.get("ticket")
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) setActiveId(t)
  }, [params])

  async function create() {
    if (!subject.trim()) return
    setSaving(true)
    const r = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, priority }),
    })
    setSaving(false)
    if (!r.ok) return toast.error((await r.json().catch(() => ({}))).error ?? "Failed")
    setOpen(false)
    setSubject("")
    setBody("")
    setPriority("MEDIUM")
    toast.success("Ticket opened")
    router.refresh()
  }

  async function setStatus(id: string, status: SupportStatus) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    const res = await fetch(`/api/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) toast.error("Update failed")
    else if (status === "RESOLVED" || status === "CLOSED") toast.success("Requester notified")
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteOne(id: string) {
    if (!confirm("Delete this ticket permanently?")) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    if (activeId === id) setActiveId(null)
    const res = await fetch(`/api/support/${id}`, { method: "DELETE" })
    if (!res.ok) toast.error("Could not delete")
  }

  async function deleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} ticket(s) permanently?`)) return
    setDeleting(true)
    const res = await fetch("/api/support", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
    setDeleting(false)
    if (!res.ok) return toast.error("Bulk delete failed")
    setRows((prev) => prev.filter((r) => !selected.has(r.id)))
    setSelected(new Set())
    toast.success(`Deleted ${ids.length} ticket(s)`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="text-muted-foreground text-sm">
            {isStaff ? `${rows.length} tickets in the queue` : "Your support tickets"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="size-4" /> New ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New support ticket</DialogTitle>
              <DialogDescription>A super-admin will review and respond.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Textarea placeholder="Describe your issue" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={create} disabled={saving || !subject.trim()} className="w-full">
                {saving && <Loader2 className="size-4 animate-spin" />} Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isStaff && (
        <div className="flex flex-wrap items-center gap-1">
          {(["ALL", ...STATUSES] as const).map((s) => (
            <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFilter(s)}>
              {s === "ALL" ? "All" : SUPPORT_STATUS_META[s].label}
            </Button>
          ))}
          {canResolve && (
            <div className="ml-auto flex items-center gap-2">
              <button
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => setSelected((prev) => (prev.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))))}
              >
                {selected.size === shown.length && shown.length > 0 ? "Clear" : "Select all"}
              </button>
              {selected.size > 0 && (
                <Button size="sm" variant="destructive" className="h-7 gap-1.5 text-xs" disabled={deleting} onClick={deleteSelected}>
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete {selected.size}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
            {isStaff ? "No tickets." : "You have no support tickets yet. Open one above."}
          </p>
        )}
        {shown.map((t) => {
          const s = sla(t.slaDueAt)
          return (
            <div key={t.id} className="hover:bg-muted/40 flex items-start gap-2 rounded-md border p-3 transition-colors">
              {canResolve && (
                <Checkbox className="mt-1 shrink-0" checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
              )}
              <button onClick={() => setActiveId(t.id)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className={SUPPORT_STATUS_META[t.status].color}>{SUPPORT_STATUS_META[t.status].label}</Badge>
                  <Badge variant="outline" className={PRIORITY_META[t.priority].color}>{PRIORITY_META[t.priority].label}</Badge>
                  <span className="font-medium">{t.subject}</span>
                </div>
                {isStaff && <p className="text-muted-foreground mt-1 text-xs">{t.requesterEmail}</p>}
                {t.body && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{t.body}</p>}
              </button>
              <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                {s && (
                  <span className={s.overdue ? "text-red-500" : ""}>
                    <Clock className="mr-1 inline size-3" />{s.label}
                  </span>
                )}
                <MessageSquare className="size-3.5" />
                {canResolve && (
                  <button onClick={() => deleteOne(t.id)} title="Delete ticket" className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <TicketDialog
        ticket={active}
        canResolve={canResolve}
        onClose={() => setActiveId(null)}
        onStatus={setStatus}
      />
    </div>
  )
}

function TicketDialog({
  ticket,
  canResolve,
  onClose,
  onStatus,
}: {
  ticket: SupportRow | null
  canResolve: boolean
  onClose: () => void
  onStatus: (id: string, status: SupportStatus) => void
}) {
  const [comments, setComments] = useState<SupportComment[]>([])
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const res = await fetch(`/api/support/${id}/comments`)
    setComments(res.ok ? await res.json() : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (ticket) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReply("")
      load(ticket.id)
    }
  }, [ticket, load])

  async function send() {
    if (!ticket || !reply.trim()) return
    setSending(true)
    const res = await fetch(`/api/support/${ticket.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: reply }),
    })
    setSending(false)
    if (!res.ok) return toast.error("Could not send")
    const created = (await res.json()) as SupportComment
    setComments((c) => [...c, created])
    setReply("")
  }

  return (
    <Dialog open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-lg">
        {ticket && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="secondary" className={SUPPORT_STATUS_META[ticket.status].color}>
                  {SUPPORT_STATUS_META[ticket.status].label}
                </Badge>
                {ticket.subject}
              </DialogTitle>
              <DialogDescription>{ticket.requesterEmail}</DialogDescription>
            </DialogHeader>

            {ticket.body && (
              <p className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap">{ticket.body}</p>
            )}

            {canResolve && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Status</span>
                <Select value={ticket.status} onValueChange={(v) => onStatus(ticket.id, v as SupportStatus)}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>{SUPPORT_STATUS_META[st].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t pt-3">
              {loading ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-muted-foreground text-center text-xs">No messages yet — start the discussion.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-md border p-2 text-sm">
                    <div className="text-muted-foreground mb-0.5 flex justify-between text-[11px]">
                      <span className="font-medium">{c.authorName}</span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-end gap-2 border-t pt-3">
              <Textarea
                placeholder="Write a message…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <Button size="icon" onClick={send} disabled={sending || !reply.trim()}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
