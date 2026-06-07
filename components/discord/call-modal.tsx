"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { LiveKitRoom, VideoConference } from "@livekit/components-react"
import "@livekit/components-styles"

import { Button } from "@/components/ui/button"

// Full-screen video/audio call backed by LiveKit. `ring` rings the others (the
// caller); joiners pass ring=false. Closes on disconnect or error.
export function CallModal({
  threadId,
  title,
  ring,
  onClose,
}: {
  threadId: string
  title: string
  ring: boolean
  onClose: () => void
}) {
  const [creds, setCreds] = useState<{ token: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/discord/call-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, ring }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) {
          setError(d.error ?? "Could not start the call")
          toast.error(d.error ?? "Could not start the call")
        } else {
          setCreds({ token: d.token, url: d.url })
        }
      })
      .catch(() => alive && setError("Could not start the call"))
    return () => { alive = false }
  }, [threadId, ring])

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-medium">Call · {title}</span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Leave call"><X className="size-4" /></Button>
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">{error}</div>
        ) : !creds ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Connecting…</div>
        ) : (
          <LiveKitRoom
            serverUrl={creds.url}
            token={creds.token}
            connect
            video
            audio
            onDisconnected={onClose}
            data-lk-theme="default"
            style={{ height: "100%" }}
          >
            <VideoConference />
          </LiveKitRoom>
        )}
      </div>
    </div>
  )
}
