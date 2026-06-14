"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MessagesSquare, Send } from "lucide-react"

import type { Message, User } from "@/lib/types"
import { useRealtime } from "@/hooks/use-realtime"
import { UserAvatar } from "@/components/shared/badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type MessageWithAuthor = Message & { author?: User }

export function TeamChat({
  workspaceId,
  currentUserId,
}: {
  workspaceId: string
  currentUserId: string
}) {
  const [messages, setMessages] = useState<MessageWithAuthor[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/messages`)
      if (res.ok) setMessages(await res.json())
    } finally {
      setLoaded(true)
    }
  }, [workspaceId])

  useEffect(() => {
    // Fetch the message history when the workspace changes (external sync).
    load()
  }, [load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Append messages in real time (including the echo of our own send).
  useRealtime(useMemo(() => [`ws:${workspaceId}`], [workspaceId]), (event) => {
    if (event.type !== "message.created") return
    const { message } = event.payload as { message: MessageWithAuthor }
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message]
    )
  })

  async function send() {
    if (!draft.trim()) return
    const content = draft.trim()
    setDraft("")
    await fetch(`/api/workspaces/${workspaceId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {loaded && messages.length === 0 && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessagesSquare className="size-8 opacity-40" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs">Start the conversation — say hello to your team.</p>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.authorId === currentUserId
          return (
            <div
              key={m.id}
              className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}
            >
              <UserAvatar name={m.author?.name ?? "?"} src={m.author?.avatarUrl} size="md" />
              <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                <div className="mb-0.5 flex items-center gap-2 text-xs">
                  <span className="font-medium">{m.author?.name}</span>
                  {m.isFromClient && (
                    <Badge variant="outline" className="text-[10px]">
                      Client
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div
                  className={`inline-block rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <Input
          placeholder="Message the team…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="icon" disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}
