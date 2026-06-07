"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { ALL_ROLES, ROLE_LABELS, type Role } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function NotifyBroadcast() {
  const [role, setRole] = useState<Role | "ALL">("ALL")
  const [message, setMessage] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [sending, setSending] = useState(false)

  async function send() {
    if (!message.trim()) return
    setSending(true)
    const res = await fetch("/api/admin/notify-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, message, linkUrl: linkUrl || undefined }),
    })
    setSending(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Could not send")
    toast.success(`Notification sent to ${data.sent} user(s)`)
    setMessage("")
    setLinkUrl("")
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Push a notification to every user of a role (or everyone). They&apos;ll see it in
        their notification bell.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Audience</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role | "ALL")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Everyone</SelectItem>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nb-link">Link (optional)</Label>
          <Input id="nb-link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="/dashboard" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-msg">Message</Label>
        <Textarea id="nb-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Heads up — scheduled maintenance tonight at 22:00." />
      </div>
      <div className="flex justify-end">
        <Button onClick={send} disabled={sending || !message.trim()}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send notification
        </Button>
      </div>
    </div>
  )
}
