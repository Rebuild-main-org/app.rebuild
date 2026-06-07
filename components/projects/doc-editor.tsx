"use client"

import { useMemo, useState } from "react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

// Minimal Markdown rendering — enough for headings, bold, inline code and
// bullet lists. The full editor (versioned pages, PDF export) is a later phase.
function renderMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const lines = esc(src).split("\n")
  const out: string[] = []
  let inList = false
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>")
        inList = true
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`)
      continue
    }
    if (inList) {
      out.push("</ul>")
      inList = false
    }
    if (/^### /.test(line)) out.push(`<h3>${inline(line.slice(4))}</h3>`)
    else if (/^## /.test(line)) out.push(`<h2>${inline(line.slice(3))}</h2>`)
    else if (/^# /.test(line)) out.push(`<h1>${inline(line.slice(2))}</h1>`)
    else if (line.trim() === "") out.push("")
    else out.push(`<p>${inline(line)}</p>`)
  }
  if (inList) out.push("</ul>")
  return out.join("\n")
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
}

const SAMPLE = `# Architecture overview

This project follows the **monolithic modular** approach described in the spec.

## Stack
- Next.js App Router (frontend + API routes)
- In-memory data layer (swap for Prisma later)
- shadcn/ui + Tailwind

## Conventions
- Tickets are the source of truth
- Link commits with \`[ACME-142]\` in the message
`

export function DocEditor() {
  const [content, setContent] = useState(SAMPLE)
  const [tab, setTab] = useState("edit")
  const html = useMemo(() => renderMarkdown(content), [content])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-muted-foreground text-xs">
          Markdown · autosaved to this session
        </span>
      </div>

      {tab === "edit" ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[420px] font-mono text-sm"
        />
      ) : (
        <div
          className="prose-doc min-h-[420px] rounded-lg border p-6 text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}
