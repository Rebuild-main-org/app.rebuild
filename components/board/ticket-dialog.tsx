"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Eye,
  EyeOff,
  GitBranch,
  GitCommit,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  LINK_LABELS,
  STATUS_LABELS,
  TICKET_STATUSES,
  TYPE_META,
  type Activity,
  type Comment,
  type LinkType,
  type Ticket,
  type TicketAttachment,
  type TicketPriority,
  type TicketStatus,
  type User,
} from "@/lib/types"
import { useRealtime } from "@/hooks/use-realtime"
import { TypeIcon, UserAvatar } from "@/components/shared/badges"
import { TimeTracker } from "@/components/board/time-tracker"
import { CustomFields } from "@/components/board/custom-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type CommentWithAuthor = Comment & { author?: User }
type ActivityWithActor = Activity & { actor?: User }
type LinkRow = { id: string; type: LinkType; dir: "in" | "out"; other?: { shortId: string; title: string; status: string } }

const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
const LINK_TYPES: LinkType[] = ["RELATES", "BLOCKS", "DUPLICATES"]

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function TicketDialog({
  ticketId,
  users,
  canDelete,
  currentUserId,
  onClose,
  onChanged,
}: {
  ticketId: string | null
  users: Pick<User, "id" | "name">[]
  canDelete: boolean
  currentUserId: string
  onClose: () => void
  onChanged: () => void
}) {
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<CommentWithAuthor[]>([])
  const [activity, setActivity] = useState<ActivityWithActor[]>([])
  const [subtasks, setSubtasks] = useState<Ticket[]>([])
  const [links, setLinks] = useState<LinkRow[]>([])
  const [watchers, setWatchers] = useState<User[]>([])
  const [attachments, setAttachments] = useState<TicketAttachment[]>([])
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [linkType, setLinkType] = useState<LinkType>("RELATES")
  const [linkKey, setLinkKey] = useState("")
  const [subtaskTitle, setSubtaskTitle] = useState("")
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    const res = await fetch(`/api/tickets/${id}`)
    setLoading(false)
    if (!res.ok) return
    const d = await res.json()
    setTicket(d.ticket)
    setComments(d.comments)
    setActivity(d.activity)
    setSubtasks(d.subtasks ?? [])
    setLinks(d.links ?? [])
    setWatchers(d.watchers ?? [])
    setAttachments(d.attachments ?? [])
  }, [])

  useEffect(() => {
    if (ticketId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load(ticketId)
    } else {
      setTicket(null)
      setComments([])
      setDraft("")
    }
  }, [ticketId, load])

  useRealtime(useMemo(() => (ticketId ? [`ticket:${ticketId}`] : []), [ticketId]), (event) => {
    if (ticketId && (event.type === "comment.added" || event.type === "ticket.updated")) load(ticketId)
  })

  const isWatching = watchers.some((w) => w.id === currentUserId)

  async function patch(p: Partial<Ticket>) {
    if (!ticket) return
    setTicket({ ...ticket, ...p })
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    })
    if (!res.ok) toast.error("Update failed")
    onChanged()
    load(ticket.id)
  }

  async function addComment() {
    if (!ticket || !draft.trim()) return
    const res = await fetch(`/api/tickets/${ticket.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    })
    if (!res.ok) return toast.error("Could not post comment")
    setDraft("")
    load(ticket.id)
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editDraft }),
    })
    if (!res.ok) return toast.error("Could not edit")
    setEditing(null)
    if (ticket) load(ticket.id)
  }

  async function deleteCmt(id: string) {
    if (!confirm("Delete this comment?")) return
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Could not delete")
    if (ticket) load(ticket.id)
  }

  async function toggleWatch() {
    if (!ticket) return
    await fetch(`/api/tickets/${ticket.id}/watchers`, {
      method: isWatching ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: isWatching ? undefined : JSON.stringify({}),
    })
    load(ticket.id)
  }

  async function addLink() {
    if (!ticket || !linkKey.trim()) return
    const res = await fetch(`/api/tickets/${ticket.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toShortId: linkKey.trim(), type: linkType }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not link")
    setLinkKey("")
    load(ticket.id)
  }

  async function removeLink(id: string) {
    if (!ticket) return
    await fetch(`/api/tickets/${ticket.id}/links?linkId=${id}`, { method: "DELETE" })
    load(ticket.id)
  }

  async function createSubtask() {
    if (!ticket || !subtaskTitle.trim()) return
    const res = await fetch(`/api/projects/${ticket.projectId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: subtaskTitle.trim(), type: "SUBTASK", priority: "MEDIUM", status: "TODO", parentId: ticket.id }),
    })
    if (!res.ok) return toast.error("Could not create sub-task")
    setSubtaskTitle("")
    onChanged()
    load(ticket.id)
  }

  async function upload(files: FileList) {
    if (!ticket || files.length === 0) return
    const payload = await Promise.all(
      Array.from(files).map(async (f) => ({ name: f.name, mimeType: f.type, size: f.size, dataUrl: await readAsDataUrl(f) }))
    )
    const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: payload }),
    })
    if (!res.ok) return toast.error("Upload failed")
    setAttachments(await res.json())
    toast.success("Attached")
  }

  async function remove() {
    if (!ticket) return
    if (!confirm(`Delete ${ticket.shortId}? This cannot be undone.`)) return
    const res = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Could not delete ticket")
    toast.success("Ticket deleted")
    onChanged()
    onClose()
    router.refresh()
  }

  const subDone = subtasks.filter((s) => s.status === "DONE").length

  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {ticket && (
          <>
            <SheetHeader className="shrink-0 border-b">
              <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
                <TypeIcon type={ticket.type} />
                {ticket.shortId} · {TYPE_META[ticket.type].label}
                <button
                  onClick={toggleWatch}
                  className="hover:text-foreground ml-auto flex items-center gap-1"
                  title={isWatching ? "Stop watching" : "Watch"}
                >
                  {isWatching ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {watchers.length}
                </button>
              </div>
              <SheetTitle className="text-lg leading-snug">{ticket.title}</SheetTitle>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
              {/* Controls */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Status">
                  <Select value={ticket.status} onValueChange={(v) => patch({ status: v as TicketStatus })}>
                    <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={ticket.priority} onValueChange={(v) => patch({ priority: v as TicketPriority })}>
                    <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Assignee">
                  <Select value={ticket.assigneeId ?? "none"} onValueChange={(v) => patch({ assigneeId: v === "none" ? undefined : v })}>
                    <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Description */}
              <div>
                <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">Description</div>
                <p className="text-sm whitespace-pre-wrap">
                  {ticket.description || <span className="text-muted-foreground italic">No description.</span>}
                </p>
              </div>

              {/* Sub-tasks */}
              <div className="space-y-2">
                <div className="text-muted-foreground text-xs font-medium uppercase">
                  Sub-tasks {subtasks.length > 0 && `(${subDone}/${subtasks.length})`}
                </div>
                {subtasks.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => load(s.id)}
                    className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm"
                  >
                    <TypeIcon type={s.type} />
                    <span className={s.status === "DONE" ? "text-muted-foreground line-through" : ""}>{s.title}</span>
                    <span className="text-muted-foreground ml-auto text-[11px]">{STATUS_LABELS[s.status]}</span>
                  </button>
                ))}
                <div className="flex gap-2">
                  <Input value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="New sub-task…" className="h-8 text-sm" />
                  <Button size="icon" variant="outline" className="size-8" onClick={createSubtask} disabled={!subtaskTitle.trim()}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Links */}
              <div className="space-y-2">
                <div className="text-muted-foreground text-xs font-medium uppercase">Linked issues</div>
                {links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Link2 className="text-muted-foreground size-3.5" />
                    <span className="text-muted-foreground text-[11px]">
                      {l.dir === "out" ? LINK_LABELS[l.type].label : LINK_LABELS[l.type].inverse}
                    </span>
                    <span className="font-mono text-xs">{l.other?.shortId}</span>
                    <span className="truncate">{l.other?.title}</span>
                    <button onClick={() => removeLink(l.id)} className="hover:text-destructive ml-auto"><X className="size-3.5" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Select value={linkType} onValueChange={(v) => setLinkType(v as LinkType)}>
                    <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LINK_TYPES.map((t) => <SelectItem key={t} value={t}>{LINK_LABELS[t].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={linkKey} onChange={(e) => setLinkKey(e.target.value)} placeholder="ACME-142" className="h-8 text-sm" />
                  <Button size="icon" variant="outline" className="size-8" onClick={addLink} disabled={!linkKey.trim()}><Plus className="size-4" /></Button>
                </div>
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <div className="text-muted-foreground flex items-center justify-between text-xs font-medium uppercase">
                  Attachments
                  <Button size="sm" variant="ghost" className="h-6 gap-1" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="size-3.5" /> Add
                  </Button>
                  <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
                </div>
                {attachments.map((a) => (
                  <a key={a.id} href={`/api/attachments/${a.id}`} download className="hover:bg-muted/50 flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Paperclip className="text-muted-foreground size-3.5" />
                    <span className="truncate">{a.name}</span>
                    <span className="text-muted-foreground ml-auto text-[11px]">{(a.size / 1024).toFixed(0)} KB</span>
                  </a>
                ))}
              </div>

              {/* Custom fields */}
              <CustomFields ticketId={ticket.id} projectId={ticket.projectId} />

              {/* Time tracking */}
              <TimeTracker ticketId={ticket.id} />

              {/* Git traceability */}
              {(ticket.branch || ticket.commitRef) && (
                <div className="space-y-1.5 rounded-md border p-3">
                  <div className="text-muted-foreground text-xs font-medium uppercase">Git</div>
                  {ticket.branch && <div className="flex items-center gap-2 text-sm"><GitBranch className="text-muted-foreground size-3.5" /><code className="text-xs">{ticket.branch}</code></div>}
                  {ticket.commitRef && <div className="flex items-center gap-2 text-sm"><GitCommit className="text-muted-foreground size-3.5" /><code className="text-xs">{ticket.commitRef}</code></div>}
                </div>
              )}

              <Separator />

              {/* Comments */}
              <div className="space-y-3">
                <div className="text-muted-foreground text-xs font-medium uppercase">Comments</div>
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <UserAvatar name={c.author?.name ?? "?"} src={c.author?.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{c.author?.name}</span>
                        <span className="text-muted-foreground text-[11px]">{new Date(c.createdAt).toLocaleString()}</span>
                        {c.updatedAt !== c.createdAt && <span className="text-muted-foreground text-[11px]">(edited)</span>}
                        {c.authorId === currentUserId && editing !== c.id && (
                          <span className="ml-auto flex gap-1">
                            <button onClick={() => { setEditing(c.id); setEditDraft(c.content) }} className="hover:text-foreground text-muted-foreground"><Pencil className="size-3" /></button>
                            <button onClick={() => deleteCmt(c.id)} className="hover:text-destructive text-muted-foreground"><Trash2 className="size-3" /></button>
                          </span>
                        )}
                      </div>
                      {editing === c.id ? (
                        <div className="mt-1 flex gap-2">
                          <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={2} />
                          <div className="flex flex-col gap-1">
                            <Button size="icon" className="size-7" onClick={() => saveEdit(c.id)}><Send className="size-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(null)}><X className="size-3.5" /></Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Textarea placeholder="Write a comment… use @name to mention" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
                  <Button size="icon" onClick={addComment} disabled={!draft.trim()}><Send className="size-4" /></Button>
                </div>
              </div>

              <Separator />

              {/* Activity */}
              <div className="space-y-2">
                <div className="text-muted-foreground text-xs font-medium uppercase">Activity</div>
                {activity.map((a) => (
                  <div key={a.id} className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="text-foreground font-medium">{a.actor?.name}</span>
                    {a.message}
                    <span>· {new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>

              {canDelete && (
                <>
                  <Separator />
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={remove}>
                    <Trash2 className="size-4" /> Delete ticket
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        {!ticket && (
          <>
            {/* Always provide a title so the dialog is accessible while loading. */}
            <SheetHeader className="border-b">
              <SheetTitle className="sr-only">Ticket</SheetTitle>
            </SheetHeader>
            {loading && <div className="text-muted-foreground p-8 text-sm">Loading…</div>}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-[11px] font-medium uppercase">{label}</div>
      {children}
    </div>
  )
}
