"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, XCircle, Loader2, CircleDot, Ban, RotateCcw, Plus, CircleSlash } from "lucide-react"
import { toast } from "sonner"

import { useRealtime } from "@/hooks/use-realtime"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Run {
  id: number
  name: string
  status: string
  conclusion: string | null
  event: string
  branch: string
  runNumber: number
  url: string
  createdAt: string
  updatedAt: string
  durationMs: number
}

function fmtDuration(ms: number) {
  if (ms <= 0) return ""
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function RunStatus({ run }: { run: Run }) {
  if (run.status !== "completed") {
    if (run.status === "queued") return <CircleDot className="size-4 text-amber-500" />
    return <Loader2 className="size-4 animate-spin text-sky-500" />
  }
  if (run.conclusion === "success") return <CheckCircle2 className="size-4 text-emerald-500" />
  if (run.conclusion === "cancelled") return <CircleSlash className="text-muted-foreground size-4" />
  return <XCircle className="size-4 text-red-500" />
}

export function WorkflowRuns({ workspaceId }: { workspaceId: string }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    // Always clear loading and surface failures — an unhandled fetch rejection
    // (network/500) previously left this stuck on "Loading runs…" forever.
    try {
      const res = await fetch(`/api/git/${workspaceId}/actions`)
      if (!res.ok) throw new Error(String(res.status))
      setRuns(await res.json())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // Poll while anything is running; otherwise a slower heartbeat.
    const iv = setInterval(load, 12_000)
    return () => clearInterval(iv)
  }, [load])

  useRealtime(useMemo(() => [`ws:${workspaceId}`], [workspaceId]), (event) => {
    if (["actions.updated", "git.commit"].includes(event.type)) load()
  })

  async function op(runId: number, op: "rerun" | "rerun-failed" | "cancel") {
    setBusy(runId)
    const res = await fetch(`/api/git/${workspaceId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, op }),
    })
    setBusy(null)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Action failed")
    toast.success(op === "cancel" ? "Run cancelled" : "Re-run triggered")
    setTimeout(load, 1500)
  }

  async function addCI() {
    setAdding(true)
    const res = await fetch(`/api/git/${workspaceId}/scaffold-ci`, { method: "POST" })
    setAdding(false)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Could not add CI")
    toast.success("Added .github/workflows/ci.yml — CI will run on the next push")
    setTimeout(load, 1500)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4" /> GitHub Actions
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addCI} disabled={adding}>
            {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add CI
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading runs…</p>
        ) : error ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <XCircle className="size-4 text-red-500" /> Couldn&apos;t load workflow runs.
            <button onClick={load} className="hover:text-foreground underline">Retry</button>
          </p>
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No workflow runs yet. Click <strong>Add CI</strong> to commit a starter pipeline (lint / typecheck / test / build).
          </p>
        ) : (
          runs.map((run) => (
            <div key={run.id} className="flex items-center gap-3 rounded-md border p-2.5">
              <RunStatus run={run} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{run.name} <span className="text-muted-foreground font-normal">#{run.runNumber}</span></div>
                <div className="text-muted-foreground truncate text-xs">
                  <code>{run.branch}</code> · {run.event}
                  {run.durationMs > 0 && ` · ${fmtDuration(run.durationMs)}`}
                </div>
              </div>
              <a href={run.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground text-xs">Logs ↗</a>
              {run.status === "completed" ? (
                <Button variant="ghost" size="icon" className="size-7" disabled={busy === run.id} title="Re-run" onClick={() => op(run.id, run.conclusion === "failure" ? "rerun-failed" : "rerun")}>
                  {busy === run.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="text-destructive size-7" disabled={busy === run.id} title="Cancel" onClick={() => op(run.id, "cancel")}>
                  {busy === run.id ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
