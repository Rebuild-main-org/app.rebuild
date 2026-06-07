"use client"

// Global search palette (SHOULD). Cmd/Ctrl+K opens it; results are
// membership-scoped server-side via /api/search.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Boxes,
  Briefcase,
  FileText,
  KanbanSquare,
  Search,
  Ticket as TicketIcon,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface Results {
  tickets: { id: string; shortId: string; title: string; projectId: string; status: string }[]
  projects: { id: string; name: string; workspaceId: string }[]
  workspaces: { id: string; name: string }[]
  documents: { id: string; name: string; workspaceId: string }[]
  leads: { id: string; company: string }[]
}

const EMPTY: Results = { tickets: [], projects: [], workspaces: [], documents: [], leads: [] }

export function SearchCommand() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      setQ("")
      setRes(EMPTY)
    }
  }, [])

  const run = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length < 2) {
      setRes(EMPTY)
      return
    }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(value)}`)
        if (r.ok) setRes(await r.json())
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  const empty =
    res.tickets.length +
      res.projects.length +
      res.workspaces.length +
      res.documents.length +
      res.leads.length ===
    0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-muted/60 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="bg-muted ml-2 hidden rounded px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[20%] max-h-[60vh] translate-y-0 gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                run(e.target.value)
              }}
              placeholder="Search tickets, projects, workspaces, documents…"
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[44vh] overflow-y-auto p-2 text-sm">
            {loading && <p className="text-muted-foreground p-3">Searching…</p>}
            {!loading && q.length >= 2 && empty && (
              <p className="text-muted-foreground p-3">No results.</p>
            )}
            {q.length < 2 && (
              <p className="text-muted-foreground p-3">Type at least 2 characters.</p>
            )}

            <Group title="Tickets" show={res.tickets.length > 0}>
              {res.tickets.map((t) => (
                <Row key={t.id} icon={<TicketIcon className="size-4" />} onClick={() => go(`/?ticket=${t.id}`)}>
                  <span className="text-muted-foreground mr-2 text-xs">{t.shortId}</span>
                  {t.title}
                </Row>
              ))}
            </Group>
            <Group title="Projects" show={res.projects.length > 0}>
              {res.projects.map((p) => (
                <Row key={p.id} icon={<KanbanSquare className="size-4" />} onClick={() => go(`/workspace/${p.workspaceId}/projects/${p.id}/board`)}>
                  {p.name}
                </Row>
              ))}
            </Group>
            <Group title="Workspaces" show={res.workspaces.length > 0}>
              {res.workspaces.map((w) => (
                <Row key={w.id} icon={<Boxes className="size-4" />} onClick={() => go(`/workspace/${w.id}/overview`)}>
                  {w.name}
                </Row>
              ))}
            </Group>
            <Group title="Documents" show={res.documents.length > 0}>
              {res.documents.map((d) => (
                <Row key={d.id} icon={<FileText className="size-4" />} onClick={() => go(`/workspace/${d.workspaceId}/documents`)}>
                  {d.name}
                </Row>
              ))}
            </Group>
            <Group title="Leads" show={res.leads.length > 0}>
              {res.leads.map((l) => (
                <Row key={l.id} icon={<Briefcase className="size-4" />} onClick={() => go(`/crm`)}>
                  {l.company}
                </Row>
              ))}
            </Group>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Group({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null
  return (
    <div className="mb-1">
      <div className="text-muted-foreground px-3 py-1 text-[11px] font-medium uppercase">{title}</div>
      {children}
    </div>
  )
}

function Row({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-muted flex w-full items-center gap-2 truncate rounded-md px-3 py-2 text-left"
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  )
}
