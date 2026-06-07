"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Rocket, Loader2, CheckCircle2, XCircle, CircleDot, ArrowUpCircle, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { useRealtime } from "@/hooks/use-realtime"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Deployment {
  id: string
  url: string
  inspectorUrl?: string
  state: string
  target: string
  createdAt: number
  commitSha?: string
  commitMessage?: string
  branch?: string
}

function StateIcon({ state }: { state: string }) {
  if (state === "READY") return <CheckCircle2 className="size-4 text-emerald-500" />
  if (state === "ERROR" || state === "CANCELED") return <XCircle className="size-4 text-red-500" />
  if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING")
    return <Loader2 className="size-4 animate-spin text-sky-500" />
  return <CircleDot className="text-muted-foreground size-4" />
}

export function VercelDeployments({ workspaceId, canPromote }: { workspaceId: string; canPromote: boolean }) {
  const [data, setData] = useState<{ configured: boolean; projectId?: string | null; deployments: Deployment[]; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/git/${workspaceId}/vercel`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const iv = setInterval(load, 15_000)
    return () => clearInterval(iv)
  }, [load])

  useRealtime(useMemo(() => [`ws:${workspaceId}`], [workspaceId]), (event) => {
    if (["deployment.created", "git.commit"].includes(event.type)) load()
  })

  async function promote(deploymentId: string, isRollback: boolean) {
    if (!confirm(isRollback ? "Roll back production to this deployment?" : "Promote this deployment to production?")) return
    setBusy(deploymentId)
    const res = await fetch(`/api/git/${workspaceId}/vercel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId }),
    })
    setBusy(null)
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Failed")
    toast.success(isRollback ? "Rolled back to this deployment" : "Promoted to production")
    setTimeout(load, 1500)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="size-4" /> Deployments <span className="text-muted-foreground text-xs font-normal">· Vercel</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>
        ) : !data?.configured ? (
          <p className="text-muted-foreground text-sm">Connect Vercel to see deployments (set <code>VERCEL_TOKEN</code>).</p>
        ) : !data.projectId ? (
          <p className="text-muted-foreground text-sm">No Vercel project linked to this repo.</p>
        ) : data.deployments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No deployments yet.</p>
        ) : (
          data.deployments.map((d) => {
            const isProd = d.target === "production"
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-md border p-2.5">
                <StateIcon state={d.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={isProd ? "default" : "secondary"} className="shrink-0">{isProd ? "Production" : "Preview"}</Badge>
                    <span className="truncate text-sm">{d.commitMessage || d.url}</span>
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {d.branch && <code>{d.branch}</code>} {d.commitSha && `· ${d.commitSha.slice(0, 7)}`} · {new Date(d.createdAt).toLocaleString()}
                  </div>
                </div>
                <a href={`https://${d.url}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground text-xs">Open ↗</a>
                <a href={d.inspectorUrl ?? `https://${d.url}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground text-xs">Logs ↗</a>
                {canPromote && d.state === "READY" && (
                  <Button
                    variant="ghost" size="icon" className={cn("size-7", isProd && "text-amber-600")}
                    disabled={busy === d.id}
                    title={isProd ? "Roll back to this deployment" : "Promote to production"}
                    onClick={() => promote(d.id, isProd)}
                  >
                    {busy === d.id ? <Loader2 className="size-3.5 animate-spin" /> : isProd ? <RotateCcw className="size-3.5" /> : <ArrowUpCircle className="size-3.5" />}
                  </Button>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
