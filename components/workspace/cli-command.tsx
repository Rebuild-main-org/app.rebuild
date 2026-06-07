"use client"

import { useState } from "react"
import { Check, Copy, Terminal } from "lucide-react"

// A ready-to-paste rebuild216 command with a copy button.
export function CliCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  function copy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div
      onClick={copy}
      title="Copy command"
      className="bg-muted/60 hover:bg-muted text-muted-foreground flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px]"
    >
      <Terminal className="size-3 shrink-0" />
      <code className="min-w-0 flex-1 truncate text-foreground">{command}</code>
      {copied ? <Check className="size-3 shrink-0 text-emerald-500" /> : <Copy className="size-3 shrink-0" />}
    </div>
  )
}
