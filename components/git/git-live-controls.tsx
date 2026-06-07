"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"

import { useRealtime } from "@/hooks/use-realtime"

// Live indicator: re-renders the (server) Git page when a real GitHub webhook
// mutates git state (commit / PR / deployment). No simulation — events arrive
// from the verified /api/webhooks/github receiver.
export function GitLiveControls({ workspaceId }: { workspaceId: string }) {
  const router = useRouter()

  useRealtime(useMemo(() => [`ws:${workspaceId}`], [workspaceId]), (event) => {
    if (["git.commit", "pr.updated", "deployment.created", "actions.updated"].includes(event.type)) {
      router.refresh()
    }
  })

  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  )
}
