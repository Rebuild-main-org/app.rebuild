"use client"

import { useState } from "react"
import { FileDiff, Loader2, CheckCircle2, XCircle, CircleDot, MessageSquarePlus, Send } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Detail {
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[]
  checks: { name: string; status: string; conclusion: string | null; url?: string }[]
  headSha: string
  additions: number
  deletions: number
}
interface LineComment { id: string; path?: string; line?: number; body: string; author?: { name: string }; createdAt: string }

// Parse a unified patch into rows annotated with their new-file line number.
function buildRows(patch: string): { l: string; i: number; lineNo: number | null }[] {
  const rows: { l: string; i: number; lineNo: number | null }[] = []
  let newLine = 0
  const lines = patch.split("\n").slice(0, 80)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    let lineNo: number | null = null
    if (l.startsWith("@@")) {
      const m = /\+(\d+)/.exec(l)
      newLine = m ? parseInt(m[1], 10) : newLine
    } else if (l.startsWith("+") && !l.startsWith("+++")) {
      lineNo = newLine
      newLine += 1
    } else if (!l.startsWith("-") && !l.startsWith("---")) {
      lineNo = newLine
      newLine += 1
    }
    rows.push({ l, i, lineNo })
  }
  return rows
}

function CheckIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status !== "completed") return <CircleDot className="size-3.5 text-amber-500" />
  if (conclusion === "success") return <CheckCircle2 className="size-3.5 text-emerald-500" />
  return <XCircle className="size-3.5 text-red-500" />
}

// One file's diff with new-file line numbers + inline line comments.
function FileDiffView({
  file, comments, onAdd,
}: {
  file: Detail["files"][number]
  comments: LineComment[]
  onAdd: (path: string, line: number, body: string) => Promise<void>
}) {
  const [composer, setComposer] = useState<number | null>(null)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)

  if (!file.patch) {
    return <div className="text-muted-foreground p-2 text-[11px]">No preview (binary / large file).</div>
  }
  // Track the new-file line number per patch line.
  const rows = buildRows(file.patch)

  async function submit(line: number) {
    if (!text.trim()) return
    setSending(true)
    await onAdd(file.filename, line, text)
    setSending(false)
    setText("")
    setComposer(null)
  }

  return (
    <div className="text-[11px] leading-relaxed">
      {rows.map(({ l, i, lineNo }) => {
        const cls =
          l.startsWith("+") && !l.startsWith("+++") ? "text-emerald-600 dark:text-emerald-400"
            : l.startsWith("-") && !l.startsWith("---") ? "text-red-600 dark:text-red-400"
              : l.startsWith("@@") ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
        const lineComments = lineNo != null ? comments.filter((c) => c.line === lineNo) : []
        return (
          <div key={i}>
            <div className="group flex items-start gap-1">
              {lineNo != null ? (
                <button
                  onClick={() => setComposer(composer === lineNo ? null : lineNo)}
                  className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground mt-[1px] shrink-0"
                  title="Comment on this line"
                >
                  <MessageSquarePlus className="size-3" />
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <pre className={cn("flex-1 overflow-x-auto whitespace-pre", cls)}>{l || " "}</pre>
            </div>
            {lineComments.map((c) => (
              <div key={c.id} className="bg-muted/50 my-0.5 ml-4 rounded p-1.5">
                <span className="font-medium">{c.author?.name ?? "User"}</span>
                <span className="whitespace-pre-wrap"> {c.body}</span>
              </div>
            ))}
            {composer === lineNo && lineNo != null && (
              <div className="my-1 ml-4 flex items-end gap-1">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder={`Comment on line ${lineNo}…`}
                  className="bg-background flex-1 resize-none rounded-md border p-1.5 text-xs"
                />
                <Button size="icon" className="size-7" disabled={sending || !text.trim()} onClick={() => submit(lineNo)}>
                  {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function PrDiff({ workspaceId, prNumber }: { workspaceId: string; prNumber: number }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [comments, setComments] = useState<LineComment[]>([])
  const [loading, setLoading] = useState(false)

  async function loadComments() {
    const res = await fetch(`/api/git/${workspaceId}/prs/${prNumber}/reviews`)
    if (res.ok) setComments((await res.json()).comments ?? [])
  }
  async function load() {
    setOpen(true)
    setLoading(true)
    setDetail(null)
    const [d] = await Promise.all([
      fetch(`/api/git/${workspaceId}/prs/${prNumber}/diff`).then((r) => (r.ok ? r.json() : null)),
      loadComments(),
    ])
    setDetail(d)
    setLoading(false)
  }
  async function addComment(path: string, line: number, body: string) {
    const res = await fetch(`/api/git/${workspaceId}/prs/${prNumber}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, path, line }),
    })
    if (!res.ok) {
      toast.error("Could not add comment")
      return
    }
    toast.success("Comment added")
    loadComments()
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={load}>
        <FileDiff className="size-3.5" /> Files
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">PR #{prNumber} — files & checks</DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>
          ) : !detail ? (
            <p className="text-muted-foreground text-sm">Unavailable (PR not on the connected GitHub repo).</p>
          ) : (
            <div className="space-y-4">
              {detail.checks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Checks</p>
                  {detail.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckIcon status={c.status} conclusion={c.conclusion} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-muted-foreground">{c.conclusion ?? c.status}</span>
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">↗</a>}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-muted-foreground text-xs">
                {detail.files.length} files · <span className="text-emerald-600 dark:text-emerald-400">+{detail.additions}</span>{" "}
                <span className="text-red-600 dark:text-red-400">−{detail.deletions}</span>
                <span className="ml-2">· hover a line to comment</span>
              </div>
              {detail.files.map((f) => (
                <div key={f.filename} className="overflow-hidden rounded-md border">
                  <div className="bg-muted/40 flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                    <span className="truncate font-mono">{f.filename}</span>
                    <span className="shrink-0 font-mono">
                      <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>{" "}
                      <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                    </span>
                  </div>
                  <div className="p-2">
                    <FileDiffView file={f} comments={comments.filter((c) => c.path === f.filename)} onAdd={addComment} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
