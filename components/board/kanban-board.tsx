"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"
import { Bookmark, ListChecks, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"

import {
  PRIORITY_META,
  STATUS_LABELS,
  TICKET_STATUSES,
  TYPE_META,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
  type User,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { useRealtime } from "@/hooks/use-realtime"
import { PresenceBar } from "@/components/realtime/presence-bar"
import { TicketCard } from "@/components/board/ticket-card"
import { TicketDialog } from "@/components/board/ticket-dialog"
import { CreateTicketDialog } from "@/components/board/create-ticket-dialog"
import { Button } from "@/components/ui/button"
import { ExportButton, ImportButton } from "@/components/shared/csv-tools"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface SavedView {
  name: string
  assignee: string
  type: string
  priority: string
  search: string
}

// Columns flagged as overloaded past this many cards (spec: overload indicator).
const WIP_LIMIT: Partial<Record<TicketStatus, number>> = {
  IN_PROGRESS: 3,
  IN_REVIEW: 3,
}

export function KanbanBoard({
  projectId,
  initialTickets,
  users,
  canDelete,
  currentUserId,
}: {
  projectId: string
  initialTickets: Ticket[]
  users: Pick<User, "id" | "name">[]
  canDelete: boolean
  currentUserId: string
}) {
  const [tickets, setTickets] = useState(initialTickets)
  const [selected, setSelected] = useState<string | null>(null)
  const searchParams = useSearchParams()
  // Open a ticket directly from a notification/search deep-link (?ticket=<id>).
  useEffect(() => {
    const tid = searchParams.get("ticket")
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tid) setSelected(tid)
  }, [searchParams])
  const [createIn, setCreateIn] = useState<TicketStatus | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState("all")
  const [filterType, setFilterType] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [search, setSearch] = useState("")
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [views, setViews] = useState<SavedView[]>([])
  const [presence, setPresence] = useState<
    { userId: string; name: string; avatarUrl?: string }[]
  >([])

  const viewsKey = `board-views:${projectId}`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(viewsKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setViews(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [viewsKey])

  function persistViews(next: SavedView[]) {
    setViews(next)
    try {
      localStorage.setItem(viewsKey, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  function saveView() {
    const name = window.prompt("Name this view")?.trim()
    if (!name) return
    const view: SavedView = { name, assignee: filterAssignee, type: filterType, priority: filterPriority, search }
    persistViews([...views.filter((v) => v.name !== name), view])
    toast.success(`Saved view "${name}"`)
  }

  function applyView(v: SavedView) {
    setFilterAssignee(v.assignee)
    setFilterType(v.type)
    setFilterPriority(v.priority)
    setSearch(v.search)
  }

  function clearFilters() {
    setFilterAssignee("all")
    setFilterType("all")
    setFilterPriority("all")
    setSearch("")
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkPatch(patch: Partial<Pick<Ticket, "status" | "assigneeId" | "priority">>) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
      )
    )
    toast.success(`Updated ${ids.length} ticket(s)`)
    setSelectedIds(new Set())
    refetch()
  }

  const userName = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  )

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/tickets`)
    if (res.ok) setTickets(await res.json())
  }, [projectId])

  // Coalesce bursts (a single teammate action emits ticket.updated +
  // board.reordered) into one refetch.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null
      refetch()
    }, 250)
  }, [refetch])
  useEffect(() => () => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
  }, [])

  const room = `project:${projectId}`
  useRealtime(useMemo(() => [room], [room]), (event) => {
    if (event.type === "presence") {
      const p = event.payload as { users: { userId: string; name: string; avatarUrl?: string }[] }
      setPresence(p.users)
      return
    }
    if (
      event.type === "ticket.created" ||
      event.type === "ticket.updated" ||
      event.type === "board.reordered"
    ) {
      // Skip echoes of my own actions — the board is already updated optimistically.
      if (event.actorId && event.actorId === currentUserId) return
      scheduleRefetch()
      const who = userName.get(event.actorId ?? "")?.name ?? "A teammate"
      if (event.type === "ticket.created") toast.info(`${who} created a ticket`)
      else if (event.type === "board.reordered") toast.info(`${who} moved a ticket`)
    }
  })

  const q = search.trim().toLowerCase()
  const filtered = tickets.filter(
    (t) =>
      (filterAssignee === "all" || t.assigneeId === filterAssignee) &&
      (filterType === "all" || t.type === filterType) &&
      (filterPriority === "all" || t.priority === filterPriority) &&
      (q === "" ||
        t.title.toLowerCase().includes(q) ||
        t.shortId.toLowerCase().includes(q))
  )
  const filtersActive =
    filterAssignee !== "all" || filterType !== "all" || filterPriority !== "all" || q !== ""

  const byStatus = (status: TicketStatus) =>
    filtered
      .filter((t) => t.status === status)
      .sort((a, b) => a.order - b.order)

  async function moveTo(status: TicketStatus) {
    if (!dragId) return
    const moving = tickets.find((t) => t.id === dragId)
    setDragId(null)
    if (!moving || moving.status === status) return

    // Optimistic local update: append to the end of the target column.
    const targetMax = Math.max(0, ...tickets.filter((t) => t.status === status).map((t) => t.order))
    const updated = tickets.map((t) =>
      t.id === dragId ? { ...t, status, order: targetMax + 1 } : t
    )
    setTickets(updated)

    const orderedIds = updated
      .filter((t) => t.status === status)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id)
    // Persist in the background; the optimistic state already reflects the move,
    // and our own realtime echoes are ignored — so no refetch (no re-render jank).
    try {
      await fetch(`/api/tickets/${dragId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      await fetch(`/api/projects/${projectId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, orderedIds }),
      })
    } catch {
      // On failure, reconcile with the server truth.
      refetch()
    }
  }

  // GSAP: stagger the columns in when the board first renders.
  const columnsRef = useRef<HTMLDivElement>(null)

  // Edge-fade cues so it's obvious the columns scroll horizontally — the native
  // (overlay) scrollbar is hidden on macOS, which made the last column look
  // clipped/broken with no hint you could scroll to it.
  const [scrollHints, setScrollHints] = useState({ left: false, right: false })
  const updateScrollHints = useCallback(() => {
    const el = columnsRef.current
    if (!el) return
    setScrollHints({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])
  useEffect(() => {
    updateScrollHints()
    window.addEventListener("resize", updateScrollHints)
    return () => window.removeEventListener("resize", updateScrollHints)
  }, [updateScrollHints])
  useGSAP(
    () => {
      const cols = columnsRef.current?.children
      if (!cols || cols.length === 0) return
      gsap.from(cols, {
        y: 18,
        autoAlpha: 0,
        duration: 0.45,
        stagger: 0.06,
        ease: "power3.out",
      })
    },
    { scope: columnsRef }
  )

  return (
    <div className="flex h-full flex-col">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-44 pl-7 text-sm"
          />
        </div>
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(TYPE_META) as TicketType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_META[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {(Object.keys(PRIORITY_META) as TicketPriority[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_META[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={clearFilters}>
            <X className="size-3.5" /> Clear
          </Button>
        )}

        {/* Saved views */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Bookmark className="size-3.5" /> Views
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
            {views.length === 0 && (
              <div className="text-muted-foreground px-2 py-1.5 text-xs">No saved views</div>
            )}
            {views.map((v) => (
              <DropdownMenuItem key={v.name} onClick={() => applyView(v)} className="justify-between">
                {v.name}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    persistViews(views.filter((x) => x.name !== v.name))
                  }}
                  className="hover:text-destructive text-muted-foreground"
                >
                  <X className="size-3" />
                </button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={saveView}>Save current filters…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant={selectMode ? "default" : "outline"}
          className="h-8 gap-1.5"
          onClick={() => {
            setSelectMode((m) => !m)
            setSelectedIds(new Set())
          }}
        >
          <ListChecks className="size-3.5" /> Select
        </Button>

        <div className="flex-1" />
        <PresenceBar users={presence} selfId={currentUserId} className="mr-2" />
        <ExportButton href={`/api/export?entity=tickets&projectId=${projectId}`} label="Export" />
        <ImportButton endpoint="/api/import/tickets" extra={{ projectId }} onDone={refetch} label="Import" />
        <Button size="sm" onClick={() => setCreateIn("BACKLOG")}>
          <Plus className="size-4" /> New ticket
        </Button>
      </div>

      {/* Bulk-edit bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="bg-muted/60 flex flex-wrap items-center gap-2 border-y px-4 py-2 md:px-6">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Select onValueChange={(v) => bulkPatch({ status: v as TicketStatus })}>
            <SelectTrigger size="sm" className="w-32"><SelectValue placeholder="Set status" /></SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => bulkPatch({ priority: v as TicketPriority })}>
            <SelectTrigger size="sm" className="w-32"><SelectValue placeholder="Set priority" /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_META) as TicketPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => bulkPatch({ assigneeId: v === "none" ? undefined : v })}>
            <SelectTrigger size="sm" className="w-36"><SelectValue placeholder="Set assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassign</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Columns */}
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={columnsRef}
          onScroll={updateScrollHints}
          className="flex h-full w-full gap-3 overflow-x-auto px-4 pb-4 md:px-6"
        >
        {TICKET_STATUSES.map((status) => {
          const items = byStatus(status)
          const limit = WIP_LIMIT[status]
          const overloaded = limit != null && items.length > limit
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => moveTo(status)}
              className="bg-muted/40 flex min-h-0 w-72 shrink-0 flex-col rounded-lg"
            >
              <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {STATUS_LABELS[status]}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs",
                      overloaded
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-muted-foreground/15 text-muted-foreground"
                    )}
                  >
                    {items.length}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={() => setCreateIn(status)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {items.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    assignee={userName.get(t.assigneeId ?? "")}
                    selected={selectMode && selectedIds.has(t.id)}
                    onClick={() => (selectMode ? toggleSelect(t.id) : setSelected(t.id))}
                    onDragStart={() => setDragId(t.id)}
                  />
                ))}
                {items.length === 0 && (
                  <div className="text-muted-foreground/60 px-2 py-6 text-center text-xs">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          )
        })}
        </div>
        {/* Horizontal scroll affordance */}
        <div
          aria-hidden
          className={cn(
            "from-background pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent transition-opacity duration-200",
            scrollHints.left ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          aria-hidden
          className={cn(
            "from-background pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent transition-opacity duration-200",
            scrollHints.right ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      <TicketDialog
        ticketId={selected}
        users={users}
        canDelete={canDelete}
        currentUserId={currentUserId}
        onClose={() => setSelected(null)}
        onChanged={refetch}
      />

      {createIn && (
        <CreateTicketDialog
          projectId={projectId}
          users={users}
          defaultStatus={createIn}
          open={!!createIn}
          onOpenChange={(o) => !o && setCreateIn(null)}
          onCreated={() => refetch()}
        />
      )}
    </div>
  )
}
