"use client"

// Discord — community directory + direct messages and group rooms, with
// presence, typing, read receipts, reactions, attachments, search,
// block/mute/DND, private notes and smart matching. (WebRTC calls are future.)

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search, Send, Loader2, MessageSquare, Pencil, Sparkles, SmilePlus, Check, CheckCheck,
  StickyNote, Paperclip, X, Ban, BellOff, Users, Plus, Trash2, Phone,
} from "lucide-react"
import { CallModal } from "@/components/discord/call-modal"
import { toast } from "sonner"

import {
  AVAILABILITY_META, ROLE_LABELS,
  type Availability, type DirectMessage, type DiscordMember, type DmThread,
  type MessageAttachment, type ProfileVisibility, type Role, type UserPreferences,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { useRealtime } from "@/hooks/use-realtime"
import { UserAvatar } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Suggestion { member: DiscordMember; reason: string }
interface Rel { blocked: Set<string>; muted: Set<string> }
interface SearchHit { messageId: string; otherId: string; name: string; avatarUrl?: string; content: string; createdAt: string }
interface AdminThread { threadId: string; isGroup: boolean; name: string; memberCount: number; lastMessage: string; lastAt: string }
type Sel = { kind: "dm"; id: string } | { kind: "group"; threadId: string } | { kind: "mod"; threadId: string } | null

const AVAILABILITIES: Availability[] = ["AVAILABLE", "BUSY", "AWAY", "INVISIBLE"]
const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙏"]
const URL_RE = /(https?:\/\/[^\s]+)/g
const IMG_RE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i

function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{part}</a>
      : <span key={i}>{part}</span>
  )
}
function firstImageUrl(text: string): string | null {
  const m = text.match(URL_RE)
  return m?.find((u) => IMG_RE.test(u)) ?? null
}

function StatusDot({ availability, online, className }: { availability: Availability; online?: boolean; className?: string }) {
  const dot = online ? "bg-emerald-500" : "bg-zinc-400"
  void availability
  return <span className={cn("ring-background size-2.5 rounded-full ring-2", dot, className)} />
}

export function DiscordView({
  members: initialMembers, suggestions, meId, myPrefs, isSuperAdmin,
}: {
  members: DiscordMember[]
  suggestions: Suggestion[]
  meId: string
  myPrefs: UserPreferences
  isSuperAdmin: boolean
}) {
  const params = useSearchParams()
  const [members, setMembers] = useState(initialMembers)
  const [threads, setThreads] = useState<DmThread[]>([])
  const [rel, setRel] = useState<Rel>({ blocked: new Set(), muted: new Set() })
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL")
  const [availFilter, setAvailFilter] = useState<Availability | "ALL" | "OPEN">("ALL")
  const [tab, setTab] = useState<"messages" | "members">("members")
  const [sel, setSel] = useState<Sel>(null)
  const [msgSearch, setMsgSearch] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [adminMode, setAdminMode] = useState(false)
  const [adminThreads, setAdminThreads] = useState<AdminThread[]>([])
  const [call, setCall] = useState<{ threadId: string; title: string; ring: boolean } | null>(null)

  const startCall = useCallback((threadId: string, title: string) => setCall({ threadId, title, ring: true }), [])

  const loadAdminThreads = useCallback(async () => {
    const res = await fetch("/api/discord/admin/threads")
    if (res.ok) setAdminThreads(await res.json())
  }, [])

  async function deleteGroup(threadId: string) {
    if (!confirm("Delete this group for everyone? This is permanent.")) return
    const res = await fetch(`/api/discord/threads/${threadId}`, { method: "DELETE" })
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not delete")
    toast.success("Group deleted")
    setSel(null)
    loadThreads()
    if (adminMode) loadAdminThreads()
  }

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/discord/threads")
    if (res.ok) setThreads(await res.json())
  }, [])
  const refreshMembers = useCallback(async () => {
    const res = await fetch("/api/discord/members")
    if (res.ok) setMembers(await res.json())
  }, [])
  const loadRel = useCallback(async () => {
    const res = await fetch("/api/discord/relationships")
    if (res.ok) { const d = await res.json(); setRel({ blocked: new Set(d.blocked), muted: new Set(d.muted) }) }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadThreads(); loadRel()
    const iv = setInterval(() => { loadThreads(); refreshMembers() }, 20_000)
    return () => clearInterval(iv)
  }, [loadThreads, refreshMembers, loadRel])

  useEffect(() => {
    const dm = params.get("dm")
    const thread = params.get("thread")
    /* eslint-disable react-hooks/set-state-in-effect */
    if (thread) { setSel({ kind: "group", threadId: thread }); setTab("messages") }
    else if (dm) { setSel({ kind: "dm", id: dm }); setTab("messages") }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [params])

  useEffect(() => {
    const q = msgSearch.trim()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.length < 2) { setHits([]); return }
    const id = setTimeout(async () => {
      const res = await fetch(`/api/discord/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setHits(await res.json())
    }, 300)
    return () => clearTimeout(id)
  }, [msgSearch])

  useRealtime(useMemo(() => [`user:${meId}`], [meId]), (event) => {
    if (event.type === "dm.message") loadThreads()
    else if (event.type === "call.ring") {
      const { threadId, title, from } = event.payload as { threadId: string; title: string; from: string }
      toast(`📞 Incoming call — ${from}`, {
        duration: 30_000,
        action: { label: "Join", onClick: () => setCall({ threadId, title, ring: false }) },
      })
    }
  })

  const openDm = (id: string) => { setSel({ kind: "dm", id }); setTimeout(loadThreads, 600) }
  const openGroup = (threadId: string) => { setSel({ kind: "group", threadId }); setTimeout(loadThreads, 600) }
  const openMod = (threadId: string) => setSel({ kind: "mod", threadId })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (adminMode) loadAdminThreads()
  }, [adminMode, loadAdminThreads])

  async function toggleRel(targetId: string, kind: "BLOCK" | "MUTE", on: boolean) {
    setRel((r) => {
      const set = new Set(kind === "BLOCK" ? r.blocked : r.muted)
      if (on) set.add(targetId); else set.delete(targetId)
      return kind === "BLOCK" ? { ...r, blocked: set } : { ...r, muted: set }
    })
    await fetch("/api/discord/relationships", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, kind, on }),
    })
    if (kind === "BLOCK") {
      if (on && sel?.kind === "dm" && sel.id === targetId) setSel(null)
      refreshMembers()
    }
  }

  const selectedMember = sel?.kind === "dm" ? members.find((m) => m.id === sel.id) ?? null : null
  const selectedGroup = sel?.kind === "group" ? threads.find((t) => t.threadId === sel.threadId) ?? null : null
  const selectedModId = sel?.kind === "mod" ? sel.threadId : null

  const allTags = useMemo(() => Array.from(new Set(members.flatMap((m) => m.tags))).sort(), [members])
  const q = query.trim().toLowerCase()
  const filtered = members.filter((m) => {
    if (m.id === meId) return false
    if (roleFilter !== "ALL" && m.role !== roleFilter) return false
    if (availFilter === "OPEN" && !m.openToTalk) return false
    if (availFilter !== "ALL" && availFilter !== "OPEN" && m.availability !== availFilter) return false
    if (!q) return true
    return (
      m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q) ||
      (m.title ?? "").toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)) || m.skills.some((s) => s.toLowerCase().includes(q))
    )
  })
  const totalUnread = threads.reduce((s, t) => s + t.unread, 0)
  const isActive = (t: DmThread) => t.isGroup ? sel?.kind === "group" && sel.threadId === t.threadId : sel?.kind === "dm" && sel.id === t.otherId

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r">
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Discord</h1>
            <div className="flex items-center gap-1">
              <NewGroupDialog members={members.filter((m) => m.id !== meId)} onCreated={(tid) => { loadThreads(); openGroup(tid); setTab("messages") }} />
              <EditProfileDialog myPrefs={myPrefs} />
            </div>
          </div>
          <div className="bg-muted flex rounded-md p-0.5 text-xs font-medium">
            <button onClick={() => setTab("messages")} className={cn("flex flex-1 items-center justify-center gap-1 rounded py-1", tab === "messages" && "bg-background shadow-sm")}>
              Messages {totalUnread > 0 && <span className="bg-destructive text-destructive-foreground rounded-full px-1.5 text-[10px]">{totalUnread}</span>}
            </button>
            <button onClick={() => setTab("members")} className={cn("flex-1 rounded py-1", tab === "members" && "bg-background shadow-sm")}>Members</button>
          </div>
          {tab === "members" ? (
            <>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role, tag, skill…" className="pl-8" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | "ALL")}>
                  <SelectTrigger size="sm" className="h-7 w-28 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All roles</SelectItem>
                    {(Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== "SUPER_ADMIN").map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={availFilter} onValueChange={(v) => setAvailFilter(v as Availability | "ALL" | "OPEN")}>
                  <SelectTrigger size="sm" className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Any status</SelectItem>
                    <SelectItem value="OPEN">Open to talk</SelectItem>
                    {AVAILABILITIES.filter((a) => a !== "INVISIBLE").map((a) => <SelectItem key={a} value={a}>{AVAILABILITY_META[a].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)} placeholder="Search messages…" className="pl-8" />
              </div>
              {isSuperAdmin && (
                <div className="bg-muted/60 flex rounded-md p-0.5 text-[11px] font-medium">
                  <button onClick={() => setAdminMode(false)} className={cn("flex-1 rounded py-0.5", !adminMode && "bg-background shadow-sm")}>Mine</button>
                  <button onClick={() => setAdminMode(true)} className={cn("flex-1 rounded py-0.5", adminMode && "bg-background shadow-sm")}>All (admin)</button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "messages" && adminMode ? (
            adminThreads.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">No conversations.</p>
            ) : (
              adminThreads.map((t) => (
                <button key={t.threadId} onClick={() => openMod(t.threadId)} className={cn("hover:bg-muted/60 flex w-full items-center gap-2.5 px-3 py-2 text-left", selectedModId === t.threadId && "bg-muted")}>
                  <div className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full">{t.isGroup ? <Users className="size-3.5" /> : <MessageSquare className="size-3.5" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.name}<span className="text-muted-foreground font-normal"> · {t.memberCount}</span></div>
                    <div className="text-muted-foreground truncate text-xs">{t.lastMessage || "…"}</div>
                  </div>
                </button>
              ))
            )
          ) : tab === "messages" ? (
            hits.length > 0 ? (
              <>
                <p className="text-muted-foreground px-3 pt-2 text-[11px] font-medium tracking-wide uppercase">Search results</p>
                {hits.map((h) => (
                  <button key={h.messageId} onClick={() => openDm(h.otherId)} className="hover:bg-muted/60 flex w-full items-start gap-2.5 px-3 py-2 text-left">
                    <UserAvatar name={h.name} src={h.avatarUrl} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{h.name}</div><div className="text-muted-foreground truncate text-xs">{h.content}</div></div>
                  </button>
                ))}
              </>
            ) : threads.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">No conversations yet. Message someone from Members, or start a group.</p>
            ) : (
              threads.map((t) => (
                <button key={t.threadId} onClick={() => (t.isGroup ? openGroup(t.threadId) : openDm(t.otherId))} className={cn("hover:bg-muted/60 flex w-full items-center gap-2.5 px-3 py-2 text-left", isActive(t) && "bg-muted")}>
                  <div className="relative">
                    {t.isGroup ? (
                      <div className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full"><Users className="size-3.5" /></div>
                    ) : (
                      <>
                        <UserAvatar name={t.name} src={t.avatarUrl} />
                        <StatusDot availability={t.availability} online={t.online} className="absolute -right-0.5 -bottom-0.5" />
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-medium">{t.name}{t.isGroup && t.members ? <span className="text-muted-foreground font-normal"> · {t.members.length + 1}</span> : null}</span>
                      {t.unread > 0 && <span className="bg-destructive text-destructive-foreground shrink-0 rounded-full px-1.5 text-[10px]">{t.unread}</span>}
                    </div>
                    <div className={cn("truncate text-xs", t.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>{t.lastMessage || "…"}</div>
                  </div>
                </button>
              ))
            )
          ) : (
            <>
              {suggestions.length > 0 && roleFilter === "ALL" && availFilter === "ALL" && !q && (
                <div className="border-b p-2">
                  <p className="text-muted-foreground flex items-center gap-1 px-1 pb-1 text-[11px] font-medium tracking-wide uppercase"><Sparkles className="size-3" /> People you should talk to</p>
                  {suggestions.map((s) => (
                    <button key={s.member.id} onClick={() => openDm(s.member.id)} className={cn("hover:bg-muted/60 flex w-full items-center gap-2.5 px-3 py-2 text-left", sel?.kind === "dm" && sel.id === s.member.id && "bg-muted")}>
                      <div className="relative"><UserAvatar name={s.member.name} src={s.member.avatarUrl} /><StatusDot availability={s.member.availability} online={s.member.online} className="absolute -right-0.5 -bottom-0.5" /></div>
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.member.name}</div><div className="text-primary/80 truncate text-xs">{s.reason}</div></div>
                    </button>
                  ))}
                </div>
              )}
              {filtered.length === 0 ? (
                <p className="text-muted-foreground p-6 text-center text-sm">No members match.</p>
              ) : (
                filtered.map((m) => <MemberRow key={m.id} m={m} active={sel?.kind === "dm" && sel.id === m.id} onClick={() => openDm(m.id)} />)
              )}
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {selectedMember ? (
          <MemberPanel key={selectedMember.id} member={selectedMember} meId={meId} muted={rel.muted.has(selectedMember.id)} blocked={rel.blocked.has(selectedMember.id)} onToggleRel={toggleRel} onStartCall={startCall} />
        ) : selectedGroup ? (
          <GroupPanel
            key={selectedGroup.threadId}
            thread={selectedGroup}
            meId={meId}
            canDelete={isSuperAdmin || selectedGroup.createdBy === meId}
            onDelete={() => deleteGroup(selectedGroup.threadId)}
            onStartCall={startCall}
          />
        ) : selectedModId ? (
          <ModerationPanel key={selectedModId} threadId={selectedModId} onDelete={deleteGroup} />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-sm">
            <MessageSquare className="size-8 opacity-40" />
            Select a member or conversation to start chatting.
            {allTags.length > 0 && (
              <div className="mt-2 flex max-w-md flex-wrap justify-center gap-1">
                {allTags.slice(0, 12).map((t) => <button key={t} onClick={() => { setTab("members"); setQuery(t) }} className="hover:bg-muted rounded-full border px-2 py-0.5 text-xs">#{t}</button>)}
              </div>
            )}
          </div>
        )}
      </main>

      {call && <CallModal threadId={call.threadId} title={call.title} ring={call.ring} onClose={() => setCall(null)} />}
    </div>
  )
}

function MemberRow({ m, active, onClick }: { m: DiscordMember; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("hover:bg-muted/60 flex w-full items-center gap-2.5 px-3 py-2 text-left", active && "bg-muted")}>
      <div className="relative"><UserAvatar name={m.name} src={m.avatarUrl} /><StatusDot availability={m.availability} online={m.online} className="absolute -right-0.5 -bottom-0.5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5"><span className="truncate text-sm font-medium">{m.name}</span>{m.openToTalk && <span className="text-[10px]" title="Open to talk">💬</span>}</div>
        <div className="text-muted-foreground truncate text-xs">{m.online ? "Online" : m.title || ROLE_LABELS[m.role]}</div>
      </div>
    </button>
  )
}

function MemberPanel({
  member, meId, muted, blocked, onToggleRel, onStartCall,
}: {
  member: DiscordMember; meId: string; muted: boolean; blocked: boolean
  onToggleRel: (targetId: string, kind: "BLOCK" | "MUTE", on: boolean) => void
  onStartCall: (threadId: string, title: string) => void
}) {
  const [threadId, setThreadId] = useState<string | null>(null)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-4">
        <div className="flex items-start gap-3">
          <div className="relative"><UserAvatar name={member.name} src={member.avatarUrl} size="md" className="size-12" /><StatusDot availability={member.availability} online={member.online} className="absolute right-0 bottom-0 size-3" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{member.name}</h2>
              <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
              <span className="text-muted-foreground text-xs">{member.online ? "Online" : member.availability === "INVISIBLE" ? "Offline" : AVAILABILITY_META[member.availability].label}</span>
              {member.openToTalk && <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Open to talk</Badge>}
            </div>
            {member.title && <p className="text-muted-foreground text-sm">{member.title}</p>}
            {member.bio && <p className="mt-1 text-sm">{member.bio}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {member.skills.map((s) => <Badge key={s} variant="outline" className="text-[11px]">{s}</Badge>)}
              {member.tags.map((t) => <Badge key={t} className="bg-primary/10 text-primary text-[11px]">#{t}</Badge>)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground text-xs">{member.email}</span>
              <NoteButton subjectId={member.id} />
              <button onClick={() => onToggleRel(member.id, "MUTE", !muted)} className={cn("flex items-center gap-1 text-xs", muted ? "text-amber-600" : "text-muted-foreground hover:text-foreground")}><BellOff className="size-3.5" /> {muted ? "Unmute" : "Mute"}</button>
              <button onClick={() => { if (blocked || confirm(`Block ${member.name}?`)) onToggleRel(member.id, "BLOCK", !blocked) }} className={cn("flex items-center gap-1 text-xs", blocked ? "text-destructive" : "text-muted-foreground hover:text-destructive")}><Ban className="size-3.5" /> {blocked ? "Unblock" : "Block"}</button>
            </div>
          </div>
          {!blocked && (
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={!threadId} onClick={() => threadId && onStartCall(threadId, member.name)}>
              <Phone className="size-3.5" /> Call
            </Button>
          )}
        </div>
      </div>
      {blocked ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-sm">You blocked {member.name}. Unblock to message again.</div>
      ) : (
        <Conversation baseUrl={`/api/discord/dm/${member.id}`} meId={meId} peerName={member.name} isGroup={false} onThread={setThreadId} />
      )}
    </div>
  )
}

function GroupPanel({ thread, meId, canDelete, onDelete, onStartCall }: { thread: DmThread; meId: string; canDelete: boolean; onDelete: () => void; onStartCall: (threadId: string, title: string) => void }) {
  const names = (thread.members ?? []).map((m) => m.name)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b p-4">
        <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full"><Users className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{thread.name}</h2>
          <p className="text-muted-foreground truncate text-xs">{(thread.members?.length ?? 0) + 1} members · You, {names.join(", ")}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => onStartCall(thread.threadId, thread.name)}><Phone className="size-3.5" /> Call</Button>
        {canDelete && (
          <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={onDelete} title="Delete group"><Trash2 className="size-4" /></Button>
        )}
      </div>
      <Conversation baseUrl={`/api/discord/threads/${thread.threadId}`} meId={meId} peerName={thread.name} isGroup />
    </div>
  )
}

// SUPER_ADMIN read-only moderation view of any conversation.
function ModerationPanel({ threadId, onDelete }: { threadId: string; onDelete: (id: string) => void }) {
  const [data, setData] = useState<{ isGroup: boolean; name: string; members: { id: string; name: string }[]; messages: DirectMessage[] } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/discord/threads/${threadId}`).then(async (r) => {
      if (alive) { setData(r.ok ? await r.json() : null); setLoading(false) }
    })
    return () => { alive = false }
  }, [threadId])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b p-4">
        <div className="bg-amber-500/15 text-amber-600 flex size-9 items-center justify-center rounded-full"><Ban className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{data?.name ?? "Conversation"} <span className="text-muted-foreground text-xs font-normal">· moderation (read-only)</span></h2>
          <p className="text-muted-foreground truncate text-xs">{(data?.members ?? []).map((m) => m.name).join(", ")}</p>
        </div>
        {data?.isGroup && (
          <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={() => onDelete(threadId)} title="Delete group"><Trash2 className="size-4" /></Button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : !data || data.messages.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">No messages.</p>
        ) : (
          data.messages.map((m) => (
            <div key={m.id} className="bg-muted/50 rounded-md p-2 text-sm">
              <div className="text-muted-foreground mb-0.5 flex justify-between text-[11px]">
                <span className="font-medium">{m.senderName}</span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              {m.content && <p className="break-words whitespace-pre-wrap">{linkify(m.content)}</p>}
              {m.attachment && <AttachmentView a={m.attachment} />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Conversation({ baseUrl, meId, peerName, isGroup, onThread }: { baseUrl: string; meId: string; peerName: string; isGroup: boolean; onThread?: (id: string) => void }) {
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [pending, setPending] = useState<MessageAttachment | null>(null)
  const [sending, setSending] = useState(false)
  const [typers, setTypers] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(baseUrl)
    if (res.ok) { const data = await res.json(); setThreadId(data.threadId); if (data.threadId) onThread?.(data.threadId); setMessages(data.messages ?? []) }
    setLoading(false)
  }, [baseUrl, onThread])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, typers])

  useRealtime(useMemo(() => (threadId ? [`dm:${threadId}`] : []), [threadId]), (event) => {
    if (event.actorId === meId) return
    if (event.type === "dm.message") {
      const { message } = event.payload as { message: DirectMessage }
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      setTypers(null)
    } else if (event.type === "typing") {
      setTypers(isGroup ? "Someone" : peerName)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setTypers(null), 3500)
    } else if (event.type === "dm.read" && !isGroup) {
      setMessages((prev) => prev.map((m) => (m.senderId === meId ? { ...m, readAt: m.readAt ?? new Date().toISOString() } : m)))
    } else if (event.type === "dm.reaction") {
      const { messageId, emoji, delta } = event.payload as { messageId: string; emoji: string; delta: number }
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m
        const reactions = [...(m.reactions ?? [])]
        const i = reactions.findIndex((r) => r.emoji === emoji)
        if (i === -1 && delta > 0) reactions.push({ emoji, count: 1, mine: false })
        else if (i !== -1) reactions[i] = { ...reactions[i], count: Math.max(0, reactions[i].count + delta) }
        return { ...m, reactions: reactions.filter((r) => r.count > 0) }
      }))
    }
  })

  function onType() {
    if (!threadId) return
    const now = Date.now()
    if (now - lastTypingSent.current < 2000) return
    lastTypingSent.current = now
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rooms: [`dm:${threadId}`], type: "typing", payload: {} }) }).catch(() => {})
  }
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ""
    if (!file) return
    if (file.size > 3_000_000) return toast.error("Max 3MB")
    const reader = new FileReader()
    reader.onload = () => setPending({ url: reader.result as string, name: file.name, type: file.type })
    reader.readAsDataURL(file)
  }
  async function send() {
    if (!text.trim() && !pending) return
    setSending(true)
    const res = await fetch(baseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, attachment: pending }) })
    setSending(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not send")
    const created = (await res.json()) as DirectMessage
    setThreadId(created.threadId)
    setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]))
    setText(""); setPending(null)
  }
  async function react(messageId: string, emoji: string) {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m
      const reactions = [...(m.reactions ?? [])]
      const i = reactions.findIndex((r) => r.emoji === emoji)
      if (i === -1) reactions.push({ emoji, count: 1, mine: true })
      else { const mine = reactions[i].mine; reactions[i] = { ...reactions[i], count: reactions[i].count + (mine ? -1 : 1), mine: !mine } }
      return { ...m, reactions: reactions.filter((r) => r.count > 0) }
    }))
    await fetch("/api/discord/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, emoji }) }).catch(() => {})
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">No messages yet. Say hi.</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} mine={m.senderId === meId} onReact={react} showSender={isGroup} receipts={!isGroup} />)
        )}
        {typers && (
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <span className="bg-muted inline-flex gap-0.5 rounded-full px-2 py-1">
              <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" /><span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" /><span className="size-1 animate-bounce rounded-full bg-current" />
            </span>{typers} is typing…
          </div>
        )}
        <div ref={endRef} />
      </div>
      {pending && (
        <div className="flex items-center gap-2 border-t px-3 pt-2 text-xs"><Paperclip className="size-3.5" /><span className="truncate">{pending.name}</span><button onClick={() => setPending(null)} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button></div>
      )}
      <div className="flex items-end gap-2 border-t p-3">
        <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
        <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Attach"><Paperclip className="size-4" /></Button>
        <Textarea value={text} onChange={(e) => { setText(e.target.value); onType() }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} placeholder={`Message ${peerName}…`} rows={1} className="max-h-32 min-h-9 resize-none" />
        <Button size="icon" onClick={send} disabled={sending || (!text.trim() && !pending)}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
      </div>
    </div>
  )
}

function MessageBubble({ m, mine, onReact, showSender, receipts }: { m: DirectMessage; mine: boolean; onReact: (id: string, emoji: string) => void; showSender: boolean; receipts: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const inlineImg = m.content ? firstImageUrl(m.content) : null
  return (
    <div className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
      {showSender && !mine && <span className="text-muted-foreground mb-0.5 px-1 text-[11px]">{m.senderName}</span>}
      <div className="flex items-center gap-1">
        {mine && <ReactionPicker open={pickerOpen} setOpen={setPickerOpen} onPick={(e) => { onReact(m.id, e); setPickerOpen(false) }} />}
        <div className={cn("max-w-[75%] space-y-1 rounded-2xl px-3 py-1.5 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
          {m.content && <p className="break-words whitespace-pre-wrap">{linkify(m.content)}</p>}
          {inlineImg && (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={inlineImg} target="_blank" rel="noopener noreferrer"><img src={inlineImg} alt="" className="max-h-48 rounded-md" /></a>
          )}
          {m.attachment && <AttachmentView a={m.attachment} />}
          <span className={cn("flex items-center gap-1 text-[10px]", mine ? "text-primary-foreground/70 justify-end" : "text-muted-foreground")}>
            {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {mine && receipts && (m.readAt ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
          </span>
        </div>
        {!mine && <ReactionPicker open={pickerOpen} setOpen={setPickerOpen} onPick={(e) => { onReact(m.id, e); setPickerOpen(false) }} />}
      </div>
      {m.reactions && m.reactions.length > 0 && (
        <div className={cn("mt-0.5 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
          {m.reactions.map((r) => <button key={r.emoji} onClick={() => onReact(m.id, r.emoji)} className={cn("flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px]", r.mine ? "border-primary bg-primary/10" : "bg-muted")}>{r.emoji} {r.count}</button>)}
        </div>
      )}
    </div>
  )
}

function AttachmentView({ a }: { a: MessageAttachment }) {
  if (a.type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={a.url} download={a.name}><img src={a.url} alt={a.name} className="max-h-48 rounded-md" /></a>
    )
  }
  return <a href={a.url} download={a.name} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs underline-offset-2 hover:underline"><Paperclip className="size-3.5" /> {a.name}</a>
}

function ReactionPicker({ open, setOpen, onPick }: { open: boolean; setOpen: (o: boolean) => void; onPick: (emoji: string) => void }) {
  return (
    <div className="relative opacity-0 transition-opacity group-hover:opacity-100">
      <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground p-1" aria-label="React"><SmilePlus className="size-3.5" /></button>
      {open && <div className="bg-popover absolute bottom-6 z-10 flex gap-0.5 rounded-full border p-1 shadow-md">{QUICK_EMOJI.map((e) => <button key={e} onClick={() => onPick(e)} className="hover:bg-muted rounded-full px-1 text-base">{e}</button>)}</div>}
    </div>
  )
}

function NoteButton({ subjectId }: { subjectId: string }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  async function openDialog() {
    setOpen(true)
    if (!loaded) { const res = await fetch(`/api/discord/notes/${subjectId}`); if (res.ok) setContent((await res.json()).content ?? ""); setLoaded(true) }
  }
  async function save() {
    setSaving(true)
    const res = await fetch(`/api/discord/notes/${subjectId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) })
    setSaving(false)
    if (!res.ok) return toast.error("Could not save note")
    toast.success("Note saved"); setOpen(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button onClick={openDialog} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"><StickyNote className="size-3.5" /> Private note</button>
      <DialogContent>
        <DialogHeader><DialogTitle>Private note</DialogTitle></DialogHeader>
        <p className="text-muted-foreground text-xs">Only you can see this.</p>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="e.g. Met at the kickoff." />
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewGroupDialog({ members, onCreated }: { members: DiscordMember[]; onCreated: (threadId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState("")
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setPicked((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  async function create() {
    if (picked.size < 1) return toast.error("Pick at least one member")
    setSaving(true)
    const res = await fetch("/api/discord/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, memberIds: [...picked] }) })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not create group")
    toast.success("Group created")
    setOpen(false); setName(""); setPicked(new Set()); setQ("")
    onCreated(data.threadId)
  }
  const shown = members.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(true)} aria-label="New group"><Plus className="size-4" /></Button>
      <DialogContent>
        <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="g-name">Group name</Label><Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mobile squad" /></div>
          <div className="space-y-1.5">
            <Label>Members {picked.size > 0 && <span className="text-muted-foreground">· {picked.size} selected</span>}</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {shown.map((m) => (
                <label key={m.id} className="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
                  <Checkbox checked={picked.has(m.id)} onCheckedChange={() => toggle(m.id)} />
                  <UserAvatar name={m.name} src={m.avatarUrl} />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-muted-foreground text-xs">{ROLE_LABELS[m.role]}</span>
                </label>
              ))}
              {shown.length === 0 && <p className="text-muted-foreground p-3 text-center text-xs">No members.</p>}
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} disabled={saving || picked.size < 1}>{saving && <Loader2 className="size-4 animate-spin" />} Create group</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditProfileDialog({ myPrefs }: { myPrefs: UserPreferences }) {
  const [open, setOpen] = useState(false)
  const [availability, setAvailability] = useState<Availability>(myPrefs.availability)
  const [title, setTitle] = useState(myPrefs.title ?? "")
  const [bio, setBio] = useState(myPrefs.bio ?? "")
  const [skills, setSkills] = useState((myPrefs.skills ?? []).join(", "))
  const [tags, setTags] = useState((myPrefs.tags ?? []).join(", "))
  const [openToTalk, setOpenToTalk] = useState(myPrefs.openToTalk)
  const [dnd, setDnd] = useState(myPrefs.dnd)
  const [visibility, setVisibility] = useState<ProfileVisibility>(myPrefs.visibility)
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    const res = await fetch("/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { availability, title, bio, openToTalk, dnd, visibility, skills: skills.split(",").map((s) => s.trim()).filter(Boolean), tags: tags.split(",").map((s) => s.trim()).filter(Boolean) } }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not save")
    toast.success("Profile updated"); setOpen(false); window.location.reload()
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(true)} aria-label="Edit my profile"><Pencil className="size-4" /></Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit my profile</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Availability</Label>
              <Select value={availability} onValueChange={(v) => setAvailability(v as Availability)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{AVAILABILITIES.map((a) => <SelectItem key={a} value={a}>{AVAILABILITY_META[a].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="dp-title">Title</Label><Input id="dp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend Engineer" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dp-bio">Short bio</Label><Textarea id="dp-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="dp-skills">Skills (comma-separated)</Label><Input id="dp-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, Postgres, Figma" /></div>
          <div className="space-y-1.5"><Label htmlFor="dp-tags">Tags (comma-separated)</Label><Input id="dp-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="developer, investor, support" /></div>
          <div className="space-y-1.5"><Label>Who can see &amp; message me</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as ProfileVisibility)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="everyone">Everyone</SelectItem><SelectItem value="team">Only my teammates</SelectItem><SelectItem value="nobody">Nobody (hidden)</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={openToTalk} onCheckedChange={(v) => setOpenToTalk(!!v)} /> I&apos;m open to talk</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={dnd} onCheckedChange={(v) => setDnd(!!v)} /> Do Not Disturb (mute all DM notifications)</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
