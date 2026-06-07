"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  Clock,
  Download,
  Search,
  Users,
  Zap,
  ChevronDown,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { toCsv } from "@/lib/csv"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface AuditRow {
  id: string
  action: string
  entityType: string
  entityId: string
  userId: string
  userName: string
  userAvatar: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

type Category = "create" | "update" | "delete" | "auth" | "deploy" | "other"

function categorize(action: string): Category {
  const a = action.toLowerCase()
  if (/(login|logout|auth|signin|signup|session)/.test(a)) return "auth"
  if (/(delete|remove|destroy|revoke|archive|close)/.test(a)) return "delete"
  if (/(push|deploy|release|merge|run|build|publish)/.test(a)) return "deploy"
  if (/(create|add|invite|open|new|register|start)/.test(a)) return "create"
  if (/(update|edit|move|assign|change|rename|resolve|promote|set|toggle|complete)/.test(a))
    return "update"
  return "other"
}

const CATEGORY_STYLES: Record<Category, string> = {
  create: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  update: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  delete: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  auth: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  deploy: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  other: "border-border bg-muted text-muted-foreground",
}

function timeAgo(iso: string, now: number): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`
  return `${Math.floor(s / 2592000)}mo ago`
}

const PAGE = 50

export function AuditLogView({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<string>("all")
  const [actor, setActor] = useState<string>("all")
  const [entity, setEntity] = useState<string>("all")
  const [range, setRange] = useState<string>("all")
  const [limit, setLimit] = useState(PAGE)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Mount-gated clock so relative times don't cause hydration mismatch.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now())
    const iv = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(iv)
  }, [])

  const actors = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (!m.has(r.userId)) m.set(r.userId, r.userName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const entities = useMemo(
    () => [...new Set(rows.map((r) => r.entityType))].filter(Boolean).sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const cutoff =
      range === "24h" ? 86400e3 : range === "7d" ? 7 * 86400e3 : range === "30d" ? 30 * 86400e3 : 0
    return rows.filter((r) => {
      if (cat !== "all" && categorize(r.action) !== cat) return false
      if (actor !== "all" && r.userId !== actor) return false
      if (entity !== "all" && r.entityType !== entity) return false
      if (cutoff && now && now - new Date(r.createdAt).getTime() > cutoff) return false
      if (needle) {
        const hay = `${r.action} ${r.entityType} ${r.entityId} ${r.userName} ${JSON.stringify(
          r.meta ?? {}
        )}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, q, cat, actor, entity, range, now])

  const stats = useMemo(() => {
    const dayAgo = now ? now - 86400e3 : 0
    return {
      total: rows.length,
      actors: new Set(rows.map((r) => r.userId)).size,
      types: new Set(rows.map((r) => r.action)).size,
      last24h: dayAgo ? rows.filter((r) => new Date(r.createdAt).getTime() > dayAgo).length : 0,
    }
  }, [rows, now])

  const visible = filtered.slice(0, limit)

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((r) => ({
        when: r.createdAt,
        actor: r.userName,
        action: r.action,
        entity: `${r.entityType}:${r.entityId}`,
        meta: r.meta ? JSON.stringify(r.meta) : "",
      })),
      [
        { key: "when", label: "When" },
        { key: "actor", label: "Actor" },
        { key: "action", label: "Action" },
        { key: "entity", label: "Entity" },
        { key: "meta", label: "Meta" },
      ]
    )
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetFilters = () => {
    setQ("")
    setCat("all")
    setActor("all")
    setEntity("all")
    setRange("all")
  }
  const hasFilters = q || cat !== "all" || actor !== "all" || entity !== "all" || range !== "all"

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Activity className="size-4" />} label="Total actions" value={stats.total} />
        <Kpi icon={<Users className="size-4" />} label="Active actors" value={stats.actors} />
        <Kpi icon={<Zap className="size-4" />} label="Action types" value={stats.types} />
        <Kpi icon={<Clock className="size-4" />} label="Last 24h" value={stats.last24h} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actor, action, entity, metadata…"
            className="pl-8"
          />
        </div>
        <FilterSelect value={cat} onChange={setCat} placeholder="Category" className="w-[140px]"
          options={[
            ["all", "All categories"],
            ["create", "Created"],
            ["update", "Updated"],
            ["delete", "Deleted"],
            ["auth", "Auth"],
            ["deploy", "Deploy"],
            ["other", "Other"],
          ]}
        />
        <FilterSelect value={actor} onChange={setActor} placeholder="Actor" className="w-[160px]"
          options={[["all", "All actors"], ...actors.map((a) => [a[0], a[1]] as [string, string])]}
        />
        <FilterSelect value={entity} onChange={setEntity} placeholder="Entity" className="w-[150px]"
          options={[["all", "All entities"], ...entities.map((e) => [e, e] as [string, string])]}
        />
        <FilterSelect value={range} onChange={setRange} placeholder="Range" className="w-[130px]"
          options={[
            ["all", "All time"],
            ["24h", "Last 24h"],
            ["7d", "Last 7 days"],
            ["30d", "Last 30 days"],
          ]}
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="size-4" /> Export
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Showing {visible.length} of {filtered.length}
        {filtered.length !== rows.length && ` (filtered from ${rows.length})`}
      </p>

      {/* Feed */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            {rows.length === 0 ? "No audit entries yet." : "No entries match your filters."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-border divide-y">
            {visible.map((r) => {
              const c = categorize(r.action)
              const open = expanded === r.id
              const hasMeta = r.meta && Object.keys(r.meta).length > 0
              return (
                <li key={r.id} className="hover:bg-muted/40 transition-colors">
                  <button
                    type="button"
                    onClick={() => hasMeta && setExpanded(open ? null : r.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                      hasMeta ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <Avatar className="size-7 shrink-0">
                      {r.userAvatar && <AvatarImage src={r.userAvatar} alt={r.userName} />}
                      <AvatarFallback className="text-[10px]">
                        {r.userName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{r.userName}</span>
                        <Badge variant="outline" className={cn("font-mono text-[10px]", CATEGORY_STYLES[c])}>
                          {r.action}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        <span className="font-medium">{r.entityType}</span>
                        <span className="opacity-60"> · {r.entityId.slice(0, 12)}</span>
                      </div>
                    </div>
                    <time
                      className="text-muted-foreground shrink-0 whitespace-nowrap text-xs tabular-nums"
                      title={new Date(r.createdAt).toLocaleString()}
                      dateTime={r.createdAt}
                    >
                      {now === null ? r.createdAt.replace("T", " ").slice(0, 16) : timeAgo(r.createdAt, now)}
                    </time>
                    {hasMeta && (
                      <ChevronDown
                        className={cn(
                          "text-muted-foreground size-4 shrink-0 transition-transform",
                          open && "rotate-180"
                        )}
                      />
                    )}
                  </button>
                  {open && hasMeta && (
                    <pre className="bg-muted/50 text-muted-foreground mx-4 mb-3 overflow-x-auto rounded-md p-3 text-xs">
                      {JSON.stringify(r.meta, null, 2)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {limit < filtered.length && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Load more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-md">
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  placeholder: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
