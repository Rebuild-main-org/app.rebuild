"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Clock, MessageSquarePlus } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface MilestoneVM {
  id: string
  title: string
  description: string
  done: boolean
  validatedByClient: boolean
  clientFeedback?: string
}

export function MilestoneValidation({
  token,
  milestone,
}: {
  token: string
  milestone: MilestoneVM
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(decision: "approve" | "changes") {
    setBusy(true)
    const res = await fetch(`/api/client/${token}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestoneId: milestone.id, decision, feedback }),
    })
    setBusy(false)
    if (!res.ok) return toast.error("Could not submit")
    toast.success(decision === "approve" ? "Milestone approved" : "Feedback sent")
    setShowFeedback(false)
    setFeedback("")
    router.refresh()
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-3">
        {milestone.done ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
        ) : (
          <Clock className="text-muted-foreground size-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{milestone.title}</div>
          <div className="text-muted-foreground text-xs">{milestone.description}</div>
        </div>
        {milestone.validatedByClient ? (
          <Badge variant="secondary">Validated</Badge>
        ) : milestone.done ? (
          <Badge>Awaiting your review</Badge>
        ) : (
          <Badge variant="outline">In progress</Badge>
        )}
      </div>

      {milestone.clientFeedback && (
        <p className="text-muted-foreground mt-2 border-l-2 pl-2 text-xs italic">
          Your feedback: {milestone.clientFeedback}
        </p>
      )}

      {milestone.done && !milestone.validatedByClient && (
        <div className="mt-3 space-y-2">
          {showFeedback && (
            <Textarea
              placeholder="What needs changing?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
            />
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => submit("approve")}>
              <CheckCircle2 className="size-4" /> Approve
            </Button>
            {showFeedback ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !feedback.trim()}
                onClick={() => submit("changes")}
              >
                Send feedback
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFeedback(true)}
              >
                <MessageSquarePlus className="size-4" /> Request changes
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
