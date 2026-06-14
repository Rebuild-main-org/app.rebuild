"use client"

import { useState } from "react"
import { ThumbsUp, ThumbsDown, Check, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

// Thumbs up/down + optional note on a traced AI output. Optimistic, no
// localStorage — posts to /api/ai/feedback which writes ai_feedback and mirrors
// the score to Langfuse. Renders nothing without a traceId (older responses).
export function AiFeedback({
  traceId,
  feature,
  workspaceId,
  className,
}: {
  traceId?: string
  feature: string
  workspaceId?: string
  className?: string
}) {
  const [score, setScore] = useState<-1 | 0 | 1>(0)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState("")
  const [done, setDone] = useState(false)

  if (!traceId) return null

  async function send(value: -1 | 0 | 1, withNote?: string) {
    setScore(value) // optimistic
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId, feature, score: value, workspaceId, note: withNote }),
      })
      if (withNote !== undefined || value === 1) setDone(true)
    } catch {
      /* optimistic — a failed feedback post must never disrupt the user */
    }
  }

  if (done) {
    return (
      <span className={cn("text-muted-foreground inline-flex items-center gap-1 text-xs", className)}>
        <Check className="size-3.5 text-emerald-500" /> Thanks for the feedback
      </span>
    )
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <span className="mr-0.5">Helpful?</span>
        <button
          type="button"
          aria-label="Helpful"
          onClick={() => send(score === 1 ? 0 : 1)}
          className={cn("hover:text-foreground rounded p-1 transition-colors", score === 1 && "text-emerald-500")}
        >
          <ThumbsUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Not helpful"
          onClick={() => {
            setScore(-1)
            setNoteOpen(true)
          }}
          className={cn("hover:text-foreground rounded p-1 transition-colors", score === -1 && "text-red-500")}
        >
          <ThumbsDown className="size-3.5" />
        </button>
      </div>
      {noteOpen && (
        <div className="flex items-center gap-1.5">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was wrong? (optional)"
            className="h-7 text-xs"
            maxLength={2000}
            autoFocus
          />
          <Button size="sm" variant="outline" className="h-7" onClick={() => send(-1, note.trim() || "")}>
            Send
          </Button>
        </div>
      )}
    </div>
  )
}

// Transient AI outputs (e.g. CRM quote generation) have no persistent surface to
// host a widget — so surface the result as a dismissable toast that still
// carries the same <AiFeedback> control. The reusable pattern for toast-only
// AI features.
export function toastAiResult(opts: {
  title: string
  description?: string
  traceId?: string
  feature: string
  workspaceId?: string
}) {
  toast.custom(
    (id) => (
      <div className="bg-popover text-popover-foreground w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border p-3 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{opts.title}</p>
            {opts.description && <p className="text-muted-foreground mt-0.5 text-xs">{opts.description}</p>}
          </div>
          <button
            onClick={() => toast.dismiss(id)}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {opts.traceId && (
          <AiFeedback
            className="mt-2"
            traceId={opts.traceId}
            feature={opts.feature}
            workspaceId={opts.workspaceId}
          />
        )}
      </div>
    ),
    { duration: 15000 }
  )
}
