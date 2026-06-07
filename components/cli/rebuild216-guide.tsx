"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Terminal, Bot, KeyRound, GitBranch, Play, Rocket } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(command).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      className="bg-muted hover:bg-muted/70 group flex w-full items-start gap-2 rounded-md px-3 py-2 text-left font-mono text-xs transition-colors"
      title="Copy"
    >
      <Terminal className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre">{command}</code>
      {copied ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> : <Copy className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />}
    </button>
  )
}

function CliStatus() {
  const [status, setStatus] = useState<{ connected: boolean; lastSeenAt: string | null; lastProject: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await fetch("/api/cli/status")
        if (r.ok && alive) setStatus(await r.json())
      } catch {
        /* ignore */
      }
    }
    poll()
    const iv = setInterval(poll, 15_000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  const connected = status?.connected
  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
      connected ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/40"
    )}>
      <span className="relative flex size-2.5">
        {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex size-2.5 rounded-full", connected ? "bg-emerald-500" : "bg-zinc-400")} />
      </span>
      {status === null ? (
        <span className="text-muted-foreground">Checking CLI status…</span>
      ) : connected ? (
        <span>
          <strong className="text-emerald-700 dark:text-emerald-400">CLI connected</strong>
          {status.lastProject && <span className="text-muted-foreground"> · working on {status.lastProject}</span>}
          {status.lastSeenAt && <span className="text-muted-foreground"> · active {timeAgo(status.lastSeenAt)}</span>}
        </span>
      ) : (
        <span className="text-muted-foreground">
          No active CLI session{status.lastSeenAt ? ` · last seen ${timeAgo(status.lastSeenAt)}` : " yet"}.
        </span>
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function Step({
  n, icon, title, children,
}: {
  n: number
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{n}</div>
        <div className="bg-border mt-1 w-px flex-1" />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pb-6">
        <div className="flex items-center gap-2 font-medium">{icon} {title}</div>
        {children}
      </div>
    </div>
  )
}

export function Rebuild216Guide({ projects }: { projects: string[] }) {
  const [origin, setOrigin] = useState("https://next-app-maaref.vercel.app")
  const [os, setOs] = useState<"unix" | "windows">("unix")
  useEffect(() => {
    if (typeof window !== "undefined") {
      /* eslint-disable react-hooks/set-state-in-effect */
      setOrigin(window.location.origin)
      if (/Win/i.test(navigator.platform || navigator.userAgent)) setOs("windows")
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [])

  const winInstall = [
    `mkdir -Force "$HOME\\.rebuild216\\bin" > $null; cd "$HOME\\.rebuild216\\bin"`,
    `curl.exe -fsSL ${origin}/cli/rebuild216.mjs -o rebuild216.mjs`,
    `curl.exe -fsSL ${origin}/cli/mcp-rebuild.mjs -o mcp-rebuild.mjs`,
    `curl.exe -fsSL ${origin}/cli/package.json -o package.json`,
    `npm install; npm install -g .`,
  ].join("\n")

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Terminal className="size-6" /> Connect with rebuild216</h1>
        <p className="text-muted-foreground text-sm">
          Run an autonomous AI delivery agent (Claude Code + the rebuild MCP) on a project&apos;s tickets — or chat
          with it. It clones the repo, loads the project&apos;s agent &amp; context, commits locally, and never pushes
          until you say <code>/push</code>.
        </p>
      </div>

      <CliStatus />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Setup (one time, on your machine)</CardTitle>
            <div className="bg-muted flex rounded-md p-0.5 text-xs font-medium">
              <button onClick={() => setOs("unix")} className={cn("rounded px-2 py-1", os === "unix" && "bg-background shadow-sm")}>macOS / Linux</button>
              <button onClick={() => setOs("windows")} className={cn("rounded px-2 py-1", os === "windows" && "bg-background shadow-sm")}>Windows</button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-xs">
            Prerequisites: <strong>Node.js ≥ 18</strong>, <strong>Claude Code</strong>
            {os === "windows" ? " and Git (for Git Bash)." : "."}
          </p>

          <Step n={1} icon={<Bot className="size-4" />} title="Log Claude Code into your Anthropic account">
            <p className="text-muted-foreground text-sm">Authenticate the agent (subscription — no API key needed).</p>
            <CommandBlock command="claude login" />
          </Step>

          <Step n={2} icon={<Rocket className="size-4" />} title="Install the rebuild216 CLI">
            {os === "unix" ? (
              <>
                <p className="text-muted-foreground text-sm">One-line installer (macOS / Linux, or Git Bash on Windows):</p>
                <CommandBlock command={`curl -fsSL ${origin}/cli/install.sh | sh`} />
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">One-line installer in <strong>PowerShell</strong>:</p>
                <CommandBlock command={`irm ${origin}/cli/install.ps1 | iex`} />
                <details className="text-muted-foreground text-xs">
                  <summary className="cursor-pointer hover:text-foreground">Manual install (if the one-liner is blocked)</summary>
                  <div className="mt-2"><CommandBlock command={winInstall} /></div>
                </details>
                <p className="text-muted-foreground text-xs">Or, in <strong>Git Bash</strong>, use the macOS/Linux one-liner above.</p>
              </>
            )}
          </Step>

          <Step n={3} icon={<GitBranch className="size-4" />} title="(Optional) GitHub token for private repos">
            <p className="text-muted-foreground text-sm">Needed to clone private repositories. Skip for public ones.</p>
            <CommandBlock command={os === "unix" ? "export GITHUB_TOKEN=ghp_your_token" : '$env:GITHUB_TOKEN="ghp_your_token"'} />
          </Step>

          <Step n={4} icon={<KeyRound className="size-4" />} title="Log in to REBUILD">
            <p className="text-muted-foreground text-sm">Prompts your REBUILD email + password. Stores a token, never a password.</p>
            <CommandBlock command="rebuild216 login" />
            {os === "windows" && (
              <p className="text-muted-foreground text-xs">
                In Git Bash the password isn&apos;t masked (it&apos;ll be visible) — use PowerShell, or{" "}
                <code className="bg-muted rounded px-1">winpty rebuild216 login</code>, to mask it.
              </p>
            )}
          </Step>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Run it</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full"><Play className="size-3.5" /></div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm">Pick a project interactively, then choose <strong>autonomous delivery</strong> or <strong>chat</strong>:</p>
              <CommandBlock command="rebuild216" />
              {projects.length > 0 && (
                <>
                  <p className="text-muted-foreground pt-1 text-xs">…or jump straight to one of your projects:</p>
                  <div className="space-y-1.5">
                    {projects.map((p) => <CommandBlock key={p} command={`rebuild216 "${p}"`} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">In the session</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Type a message to chat with Claude Code, or use commands:</p>
          <ul className="space-y-1">
            <li><code className="bg-muted rounded px-1">/run</code> — autonomous pass over the open tickets</li>
            <li><code className="bg-muted rounded px-1">/push</code> — push commits to the remote (<strong>the only way to push</strong>)</li>
            <li><code className="bg-muted rounded px-1">/status</code>, <code className="bg-muted rounded px-1">/log</code>, <code className="bg-muted rounded px-1">/quit</code></li>
          </ul>
          <p className="text-muted-foreground text-xs">
            All work is committed locally per ticket; nothing is pushed until you run <code>/push</code>. The
            workspace&apos;s selected AI agent (soul, skills, UI, rules, knowledge…) is injected automatically into{" "}
            <code>.rebuild/</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
