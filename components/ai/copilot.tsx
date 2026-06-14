"use client"

import { useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Send, Sparkles, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AiFeedback } from "@/components/ai/ai-feedback"

interface Msg {
  role: "user" | "assistant"
  content: string
  traceId?: string
}

// Floating, context-aware Copilot available on every page. Rendered by the app
// shell only for roles permitted by RBAC (copilot.use).
export function Copilot() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // The IDE has its own integrated Copilot in the bottom frame.
  const onIde = pathname.includes("/ide")
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  // Stable per-conversation id so Langfuse groups this chat in the Sessions view.
  const sessionId = useRef<string>(crypto.randomUUID())

  // Derive context from the current route.
  const context = useMemo(() => {
    const ws = pathname.match(/\/workspace\/([^/]+)/)?.[1]
    const project = pathname.match(/\/projects\/([^/]+)/)?.[1]
    let page = "Dashboard"
    if (pathname.includes("/ide")) page = "IDE"
    else if (pathname.includes("/git")) page = "Git & CI/CD"
    else if (pathname.includes("/board")) page = "Kanban board"
    else if (pathname.includes("/projects")) page = "Projects"
    else if (pathname.includes("/overview")) page = "Workspace overview"
    else if (pathname.includes("/admin")) page = "Admin panel"
    return { workspaceId: ws, projectId: project, page }
  }, [pathname])

  async function send() {
    const message = draft.trim()
    if (!message || busy) return
    setDraft("")
    const next = [...messages, { role: "user" as const, content: message }]
    setMessages(next)
    setBusy(true)
    queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: "smooth" }))
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: messages.slice(-8),
          page: context.page,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          sessionId: sessionId.current,
        }),
      })
      const data = await res.json()
      setMessages([
        ...next,
        {
          role: "assistant",
          content: res.ok ? data.reply : data.error ?? "Something went wrong.",
          traceId: res.ok ? data.traceId : undefined,
        },
      ])
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error." }])
    } finally {
      setBusy(false)
      queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: "smooth" }))
    }
  }

  if (onIde) return null

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 z-50 size-12 rounded-full shadow-lg"
          size="icon"
          aria-label="Open Copilot"
        >
          <Sparkles className="size-5" />
        </Button>
      )}

      {open && (
        <div className="bg-card fixed right-5 bottom-5 z-50 flex h-[32rem] w-[24rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-xl border shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary size-4" />
              <span className="text-sm font-semibold">Copilot</span>
              <span className="text-muted-foreground text-[11px]">
                · {context.page}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>Ask me about this page, your tickets, or the codebase.</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "What should I work on next?",
                    "Summarise this project",
                    "Explain the git workflow here",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setDraft(s)}
                      className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div className={cn("max-w-[85%]", m.role === "assistant" && "space-y-1.5")}>
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {m.content}
                  </div>
                  {m.role === "assistant" && m.traceId && (
                    <AiFeedback
                      traceId={m.traceId}
                      feature="chat"
                      workspaceId={context.workspaceId}
                    />
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="text-muted-foreground text-xs">Copilot is thinking…</div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask the Copilot…"
              autoFocus
            />
            <Button type="submit" size="icon" disabled={busy || !draft.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
