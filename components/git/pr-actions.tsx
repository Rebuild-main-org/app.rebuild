"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, GitMerge, MessageSquare, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import type { CodeReview } from "@/lib/ai"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { AiFeedback } from "@/components/ai/ai-feedback"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const SCORE_COLOR: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  B: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  C: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  D: "bg-red-500/15 text-red-600 dark:text-red-400",
}
const SEV_COLOR: Record<string, string> = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-muted-foreground",
}

interface ReviewRow {
  id: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED"
  body?: string
  reviewer?: { name: string }
}
interface CommentRow {
  id: string
  body: string
  author?: { name: string }
  createdAt: string
}

export function PrActions({
  workspaceId,
  prNumber,
  status,
  ci,
  canMerge,
  canReview,
}: {
  workspaceId: string
  prNumber: number
  status: string
  ci: string
  canMerge: boolean
  canReview: boolean
}) {
  const router = useRouter()
  const [review, setReview] = useState<CodeReview | null>(null)
  const [reviewTraceId, setReviewTraceId] = useState<string | undefined>()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)

  // human review panel
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [body, setBody] = useState("")

  async function runReview() {
    setLoading(true)
    setOpen(true)
    setReview(null)
    const res = await fetch("/api/ai/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wsId: workspaceId, prNumber }),
    })
    setLoading(false)
    if (res.ok) {
      const d = await res.json()
      setReview(d.review)
      setReviewTraceId(d.traceId)
    } else toast.error("Review failed")
  }

  async function loadReviews() {
    const res = await fetch(`/api/git/${workspaceId}/prs/${prNumber}/reviews`)
    if (res.ok) {
      const d = await res.json()
      setReviews(d.reviews)
      setComments(d.comments)
    }
  }

  async function openReview() {
    setReviewOpen(true)
    loadReviews()
  }

  async function submitReview(state: ReviewRow["state"]) {
    const res = await fetch(`/api/git/${workspaceId}/prs/${prNumber}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, body }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      return toast.error(error ?? "Review failed")
    }
    toast.success(state === "APPROVED" ? "Approved" : state === "CHANGES_REQUESTED" ? "Changes requested" : "Comment added")
    setBody("")
    loadReviews()
    router.refresh()
  }

  async function merge(strategy: "squash" | "merge" | "rebase") {
    if (!confirm(`${strategy === "squash" ? "Squash and merge" : strategy === "rebase" ? "Rebase and merge" : "Create a merge commit for"} PR #${prNumber}?`)) return
    setMerging(true)
    const res = await fetch(`/api/git/${workspaceId}/prs/${prNumber}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy }),
    })
    setMerging(false)
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      return toast.error(error ?? "Merge failed")
    }
    toast.success(`PR #${prNumber} merged`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={runReview}>
        <Sparkles className="size-3.5" /> AI
      </Button>
      {canReview && status === "OPEN" && (
        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={openReview}>
          <MessageSquare className="size-3.5" /> Review
        </Button>
      )}
      {canMerge && status === "OPEN" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1" disabled={merging || ci === "FAILING" || ci === "RUNNING"} title={ci === "FAILING" ? "CI is failing" : ci === "RUNNING" ? "CI is running" : "Merge"}>
              <GitMerge className="size-3.5" /> Merge
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => merge("squash")}>Squash and merge</DropdownMenuItem>
            <DropdownMenuItem onClick={() => merge("merge")}>Create a merge commit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => merge("rebase")}>Rebase and merge</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Human review dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review — PR #{prNumber}</DialogTitle>
            <DialogDescription>Approve, request changes, or comment. An approval is required to merge.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {reviews.length > 0 && (
              <div className="space-y-1.5">
                {reviews.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    {r.state === "APPROVED" ? <Check className="size-3.5 text-emerald-500" /> : r.state === "CHANGES_REQUESTED" ? <X className="size-3.5 text-red-500" /> : <MessageSquare className="text-muted-foreground size-3.5" />}
                    <span className="font-medium">{r.reviewer?.name}</span>
                    <span className="text-muted-foreground text-xs">{r.state.replace("_", " ").toLowerCase()}</span>
                    {r.body && <span className="text-muted-foreground truncate text-xs">— {r.body}</span>}
                  </div>
                ))}
              </div>
            )}
            {comments.length > 0 && (
              <div className="space-y-1.5 border-t pt-2">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <span className="font-medium">{c.author?.name}</span>{" "}
                    <span className="text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString()}</span>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
            <Textarea placeholder="Leave a review comment…" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => submitReview("APPROVED")}><Check className="size-4" /> Approve</Button>
              <Button size="sm" variant="outline" onClick={() => submitReview("CHANGES_REQUESTED")}><X className="size-4" /> Request changes</Button>
              <Button size="sm" variant="ghost" disabled={!body.trim()} onClick={() => submitReview("COMMENTED")}>Comment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI review dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4" /> AI code review — PR #{prNumber}</DialogTitle>
            <DialogDescription>Non-blocking suggestions. The engineer decides.</DialogDescription>
          </DialogHeader>
          {loading && <p className="text-muted-foreground py-8 text-center text-sm">Analysing the diff…</p>}
          {review && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className={cn("flex size-10 items-center justify-center rounded-lg text-lg font-bold", SCORE_COLOR[review.score])}>{review.score}</span>
                <div>
                  <div className="text-sm font-medium">Quality score</div>
                  <Badge variant="outline" className="mt-0.5 text-[10px]">Claude</Badge>
                </div>
              </div>
              <p className="text-sm">{review.summary}</p>
              <div className="space-y-2">
                {review.findings.map((f, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[11px] font-semibold uppercase", SEV_COLOR[f.severity])}>{f.severity}</span>
                      <span className="text-sm font-medium">{f.title}</span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">{f.detail}</p>
                  </div>
                ))}
                {review.findings.length === 0 && <p className="text-muted-foreground text-sm">No issues found. 🎉</p>}
              </div>
              {reviewTraceId && <AiFeedback traceId={reviewTraceId} feature="review" workspaceId={workspaceId} />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
