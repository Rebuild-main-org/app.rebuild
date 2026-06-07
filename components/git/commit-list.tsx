"use client"

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export interface CommitItem {
  sha: string
  hash: string
  message: string
  authorName?: string
  date: string
}

interface CommitDiff {
  shortSha: string
  message: string
  author: string
  date: string
  url: string
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[]
}

const TICKET_RE = /\[([A-Z][A-Z0-9]+-\d+)\]/g

// Render a commit message, turning [SHORT-ID] mentions into clickable chips.
function MessageWithTickets({ message, workspaceId }: { message: string; workspaceId: string }) {
  const router = useRouter()
  async function go(shortId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const res = await fetch(`/api/git/${workspaceId}/ticket-link?shortId=${encodeURIComponent(shortId)}`)
    const { url } = await res.json().catch(() => ({ url: null }))
    if (url) router.push(url)
    else toast.info(`No ticket ${shortId} in this workspace`)
  }
  const parts = message.split(TICKET_RE)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <button key={i} onClick={(e) => go(p, e)} className="bg-primary/10 text-primary mx-0.5 rounded px-1 text-[11px] font-medium hover:underline">
            {p}
          </button>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  )
}

function DiffLines({ patch }: { patch?: string }) {
  if (!patch) return <div className="text-muted-foreground p-2 text-[11px]">No preview (binary / large file).</div>
  const lines = patch.split("\n").slice(0, 40)
  return (
    <pre className="overflow-x-auto p-2 text-[11px] leading-relaxed">
      {lines.map((l, i) => {
        const cls =
          l.startsWith("+") && !l.startsWith("+++") ? "text-emerald-600 dark:text-emerald-400"
            : l.startsWith("-") && !l.startsWith("---") ? "text-red-600 dark:text-red-400"
              : l.startsWith("@@") ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"
        return <div key={i} className={cn("whitespace-pre", cls)}>{l || " "}</div>
      })}
    </pre>
  )
}

export function CommitList({ commits, workspaceId }: { commits: CommitItem[]; workspaceId: string }) {
  const [openSha, setOpenSha] = useState<string | null>(null)
  const [diff, setDiff] = useState<CommitDiff | null>(null)
  const [loading, setLoading] = useState(false)

  async function open(sha: string) {
    setOpenSha(sha)
    setDiff(null)
    setLoading(true)
    const res = await fetch(`/api/git/${workspaceId}/commit/${sha}`)
    setDiff(res.ok ? await res.json() : null)
    setLoading(false)
  }

  return (
    <>
      <div className="space-y-1.5">
        {commits.map((c) => (
          <div key={c.sha + c.hash} className="flex items-center gap-3 border-b py-2 text-sm last:border-0">
            <button onClick={() => open(c.sha)} className="text-muted-foreground hover:text-foreground text-xs" title="View diff">
              <code>{c.hash}</code>
            </button>
            <span className="min-w-0 flex-1 truncate">
              <MessageWithTickets message={c.message} workspaceId={workspaceId} />
            </span>
            {/rebuild216/i.test(c.message) && (
              <span className="bg-primary/10 text-primary shrink-0 rounded px-1 text-[10px] font-medium" title="Delivered by the rebuild216 agent">🤖 agent</span>
            )}
            <span className="text-muted-foreground text-xs">{c.authorName}</span>
            <span className="text-muted-foreground text-xs">{new Date(c.date).toLocaleDateString()}</span>
          </div>
        ))}
        {commits.length === 0 && <p className="text-muted-foreground py-4 text-center text-sm">No commits.</p>}
      </div>

      <Dialog open={!!openSha} onOpenChange={(o) => !o && setOpenSha(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{diff?.message ?? "Commit"}</DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading diff…</p>
          ) : !diff ? (
            <p className="text-muted-foreground text-sm">Diff unavailable (commit not on the connected GitHub repo).</p>
          ) : (
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs">
                {diff.author} · <code>{diff.shortSha}</code>{diff.date && ` · ${new Date(diff.date).toLocaleString()}`} ·{" "}
                <a href={diff.url} target="_blank" rel="noreferrer" className="hover:text-foreground underline">GitHub ↗</a>
              </div>
              {diff.files.map((f) => (
                <div key={f.filename} className="overflow-hidden rounded-md border">
                  <div className="bg-muted/40 flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                    <span className="truncate font-mono">{f.filename}</span>
                    <span className="shrink-0 font-mono">
                      <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>{" "}
                      <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                    </span>
                  </div>
                  <DiffLines patch={f.patch} />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
