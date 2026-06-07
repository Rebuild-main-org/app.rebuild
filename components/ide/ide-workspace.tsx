"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  FilePlus2,
  FolderPlus,
  GitCompare,
  Save,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import type { Branch, FileStatus, RepoFile, TreeNode } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useRealtime } from "@/hooks/use-realtime"
import { PresenceBar } from "@/components/realtime/presence-bar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BranchSelector } from "@/components/ide/branch-selector"
import { CodeEditor } from "@/components/ide/code-editor"
import { CommitDialog } from "@/components/ide/commit-dialog"
import { DiffViewer } from "@/components/ide/diff-viewer"
import { FileTree } from "@/components/ide/file-tree"

type OpenFile = {
  path: string
  content: string
  original: string
  status: FileStatus
  dirty: boolean
}

interface Collaborator {
  userId: string
  name: string
  path: string
  line: number
}

export function IdeWorkspace({
  workspaceId,
  repo,
  branches: initialBranches,
  activeTicket,
  currentUserId,
  githubMode = false,
}: {
  workspaceId: string
  repo: RepoFile[]
  branches: Branch[]
  activeTicket?: string
  currentUserId: string
  githubMode?: boolean
}) {
  const [files, setFiles] = useState<RepoFile[]>(repo)
  const [branches, setBranches] = useState(initialBranches)
  const [branch, setBranch] = useState(
    initialBranches.find((b) => b.name === "main")?.name ??
      initialBranches[0]?.name ??
      "main"
  )
  const [open, setOpen] = useState<OpenFile[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [diffPath, setDiffPath] = useState<string | null>(null)
  const [presence, setPresence] = useState<{ userId: string; name: string; avatarUrl?: string }[]>(
    []
  )
  const [collaborators, setCollaborators] = useState<
    Record<string, Collaborator>
  >({})
  const lastCursorSent = useRef(0)
  const [docs, setDocs] = useState<{ open: boolean; loading: boolean; content: string }>(
    { open: false, loading: false, content: "" }
  )

  async function generateDocs(path: string) {
    setDocs({ open: true, loading: true, content: "" })
    const res = await fetch("/api/ai/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wsId: workspaceId, path }),
    })
    const data = await res.json().catch(() => ({}))
    setDocs({
      open: true,
      loading: false,
      content: res.ok ? data.docs : "Failed to generate documentation.",
    })
  }

  const ideRoom = `ide:${workspaceId}`
  useRealtime(useMemo(() => [ideRoom], [ideRoom]), (event) => {
    if (event.type === "presence") {
      const p = event.payload as { users: { userId: string; name: string; avatarUrl?: string }[] }
      setPresence(p.users)
      // Drop cursor markers for anyone who left.
      setCollaborators((prev) => {
        const ids = new Set(p.users.map((u) => u.userId))
        return Object.fromEntries(
          Object.entries(prev).filter(([uid]) => ids.has(uid))
        )
      })
    } else if (event.type === "cursor" && event.actorId !== currentUserId) {
      const c = event.payload as { path: string; line: number }
      const name =
        presence.find((p) => p.userId === event.actorId)?.name ?? "Teammate"
      setCollaborators((prev) => ({
        ...prev,
        [event.actorId!]: { userId: event.actorId!, name, ...c },
      }))
    }
  })

  // Broadcast my cursor position (throttled) so teammates see where I'm editing.
  const broadcastCursor = useCallback(
    (path: string, line: number) => {
      const now = Date.now()
      if (now - lastCursorSent.current < 250) return
      lastCursorSent.current = now
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rooms: [ideRoom],
          type: "cursor",
          payload: { path, line },
        }),
      }).catch(() => {})
    },
    [ideRoom]
  )

  const tree: TreeNode[] = useMemo(() => buildTree(files), [files])
  const changes = useMemo(
    () =>
      githubMode
        ? open.filter((f) => f.dirty).map((f) => ({ path: f.path, status: "modified" as FileStatus }))
        : files
            .filter((f) => f.status !== "unmodified")
            .map((f) => ({ path: f.path, status: f.status })),
    [files, open, githubMode]
  )
  const activeFile = open.find((f) => f.path === active) ?? null

  const openFile = useCallback(
    async (path: string) => {
      setDiffPath(null)
      if (open.some((f) => f.path === path)) {
        setActive(path)
        return
      }
      const res = await fetch(
        `/api/git/${workspaceId}/file?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`
      )
      if (!res.ok) return
      const file = (await res.json()) as RepoFile
      setOpen((prev) => [
        ...prev,
        {
          path: file.path,
          content: file.content,
          original: file.originalContent,
          status: file.status,
          dirty: false,
        },
      ])
      setActive(path)
    },
    [open, workspaceId, branch]
  )

  function edit(path: string, content: string) {
    setOpen((prev) =>
      prev.map((f) =>
        f.path === path
          ? { ...f, content, dirty: content !== f.original }
          : f
      )
    )
  }

  function closeTab(path: string) {
    setOpen((prev) => {
      const next = prev.filter((f) => f.path !== path)
      if (active === path) setActive(next[next.length - 1]?.path ?? null)
      return next
    })
  }

  async function save(path: string) {
    const file = open.find((f) => f.path === path)
    if (!file) return
    const res = await fetch(`/api/git/${workspaceId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content: file.content, branch }),
    })
    if (!res.ok) {
      toast.error("Save failed")
      return
    }
    const { file: saved } = (await res.json()) as { file: RepoFile }
    setOpen((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, dirty: false, status: saved.status } : f
      )
    )
    setFiles((prev) =>
      prev.map((f) =>
        f.path === path
          ? { ...f, content: saved.content, status: saved.status }
          : f
      )
    )
    toast.success(`Saved ${path}`)
  }

  async function refreshFiles() {
    // Re-fetch every file's state so statuses reset after a commit.
    const fresh = await Promise.all(
      files.map(async (f) => {
        const r = await fetch(
          `/api/git/${workspaceId}/file?path=${encodeURIComponent(f.path)}`
        )
        return r.ok ? ((await r.json()) as RepoFile) : f
      })
    )
    setFiles(fresh)
    setOpen((prev) =>
      prev.map((o) => {
        const ff = fresh.find((f) => f.path === o.path)
        return ff
          ? { ...o, original: ff.originalContent, status: ff.status }
          : o
      })
    )
  }

  async function newFile() {
    const path = window.prompt("New file path (e.g. lib/util.ts)")
    if (!path?.trim()) return
    const res = await fetch(`/api/git/${workspaceId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path.trim(), content: "", create: true }),
    })
    if (!res.ok) {
      toast.error("Could not create file")
      return
    }
    const { file } = (await res.json()) as { file: RepoFile }
    setFiles((prev) => [...prev, file])
    openFile(file.path)
  }

  async function newFolder() {
    const name = window.prompt("New folder path (e.g. lib/utils)")
    if (!name?.trim()) return
    // Git has no empty folders — materialize it with a .gitkeep file.
    const path = `${name.trim().replace(/\/$/, "")}/.gitkeep`
    const res = await fetch(`/api/git/${workspaceId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content: "", create: true }),
    })
    if (!res.ok) return toast.error("Could not create folder")
    const { file } = (await res.json()) as { file: RepoFile }
    setFiles((prev) => [...prev, file])
    toast.success(`Created ${name.trim()}/`)
  }

  async function moveFile(from: string, toDir: string) {
    const base = from.split("/").pop() ?? from
    const to = toDir ? `${toDir}/${base}` : base
    if (to === from) return
    // Confirm the move as a commit (with a message), like any other change.
    const message = window.prompt(`Commit message for moving "${base}"`, `Move ${from} → ${to}`)
    if (message === null) return
    const res = await fetch(`/api/git/${workspaceId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, message, branch }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Move failed" }))
      return toast.error(error ?? "Move failed")
    }
    setFiles((prev) => prev.map((f) => (f.path === from ? { ...f, path: to, id: to } : f)))
    setOpen((prev) => prev.map((f) => (f.path === from ? { ...f, path: to } : f)))
    if (active === from) setActive(to)
    toast.success(`Moved to ${to}`)
  }

  async function deleteEntry(path: string, isDir: boolean) {
    // A folder deletes every file beneath it; a file deletes itself.
    const targets = isDir
      ? files.filter((f) => f.path === path || f.path.startsWith(`${path}/`)).map((f) => f.path)
      : [path]
    if (targets.length === 0) return
    const label = isDir ? `folder "${path}/" (${targets.length} file(s))` : `"${path}"`
    if (!window.confirm(`Delete ${label}? This commits the deletion.`)) return
    const message = window.prompt(
      `Commit message for deleting ${isDir ? `${path}/` : path}`,
      `Delete ${path}${isDir ? "/" : ""}`
    )
    if (message === null) return
    const res = await fetch(`/api/git/${workspaceId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: targets, message, branch }),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Delete failed" }))
      return toast.error(error ?? "Delete failed")
    }
    const gone = new Set(targets)
    setFiles((prev) => prev.filter((f) => !gone.has(f.path)))
    setOpen((prev) => {
      const next = prev.filter((f) => !gone.has(f.path))
      if (active && gone.has(active)) setActive(next[next.length - 1]?.path ?? null)
      return next
    })
    if (diffPath && gone.has(diffPath)) setDiffPath(null)
    toast.success(`Deleted ${targets.length} file(s)`)
  }

  async function switchBranch(b: string) {
    setBranch(b)
    setOpen([])
    setActive(null)
    setDiffPath(null)
    try {
      const res = await fetch(`/api/git/${workspaceId}/files?branch=${encodeURIComponent(b)}`)
      if (res.ok) setFiles((await res.json()) as RepoFile[])
    } catch {
      /* ignore */
    }
  }

  async function commitDirty(message: string): Promise<boolean> {
    const dirty = open.filter((f) => f.dirty)
    if (dirty.length === 0) {
      toast.info("No edited files to commit — open and edit a file first.")
      return false
    }
    for (const f of dirty) {
      const res = await fetch(`/api/git/${workspaceId}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: f.path, content: f.content, commitMessage: message, branch }),
      })
      if (!res.ok) {
        toast.error(`Commit failed for ${f.path}`)
        return false
      }
    }
    setOpen((prev) => prev.map((f) => (f.dirty ? { ...f, dirty: false } : f)))
    toast.success(`Committed ${dirty.length} file(s)`)
    return true
  }

  const diffFile = diffPath
    ? (files.find((f) => f.path === diffPath) ?? null)
    : null
  const suggestedBranch = activeTicket
    ? `feature/${activeTicket}-`
    : undefined

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <BranchSelector
          workspaceId={workspaceId}
          branches={branches}
          current={branch}
          suggestedName={suggestedBranch}
          onChange={switchBranch}
          onBranchesChanged={setBranches}
        />
        <div className="bg-border h-5 w-px" />
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={newFile}>
          <FilePlus2 className="size-4" /> New file
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={newFolder}>
          <FolderPlus className="size-4" /> New folder
        </Button>
        <div className="flex-1" />
        <PresenceBar
          users={presence}
          selfId={currentUserId}
          className="mr-1"
        />
        {activeFile && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => generateDocs(activeFile.path)}
              title="Generate documentation with AI"
            >
              <Sparkles className="size-4" /> Docs
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={!activeFile.dirty}
              onClick={() => save(activeFile.path)}
            >
              <Save className="size-4" /> Save
            </Button>
          </>
        )}
        <CommitDialog
          workspaceId={workspaceId}
          branch={branch}
          changes={changes}
          activeTicket={activeTicket}
          onCommit={githubMode ? commitDirty : undefined}
          onCommitted={refreshFiles}
        />
      </div>

      {/* Body: explorer | editor */}
      <div className="flex min-h-0 flex-1">
        {/* Explorer */}
        <aside className="bg-sidebar/50 flex w-60 shrink-0 flex-col overflow-y-auto border-r">
          <div className="text-muted-foreground px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
            Explorer
          </div>
          <FileTree
            tree={tree}
            activePath={active}
            onOpen={openFile}
            onMove={githubMode ? moveFile : undefined}
            onDelete={githubMode ? deleteEntry : undefined}
          />
          {changes.length > 0 && (
            <div className="mt-2 border-t pt-2">
              <div className="text-muted-foreground px-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
                Changes ({changes.length})
              </div>
              {changes.map((c) => (
                <button
                  key={c.path}
                  onClick={() => {
                    setDiffPath(c.path)
                    setActive(null)
                  }}
                  className="hover:bg-muted/60 flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs"
                >
                  <GitCompare className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate font-mono">
                    {c.path.split("/").pop()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Editor column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tabs */}
          <div className="flex items-center overflow-x-auto border-b">
            {open.map((f) => (
              <div
                key={f.path}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-r px-3 py-1.5 text-sm",
                  active === f.path && !diffPath
                    ? "bg-background"
                    : "bg-muted/40 text-muted-foreground"
                )}
              >
                <button
                  onClick={() => {
                    setActive(f.path)
                    setDiffPath(null)
                  }}
                  className="max-w-40 truncate"
                >
                  {f.path.split("/").pop()}
                  {f.dirty && " •"}
                </button>
                <button
                  onClick={() => closeTab(f.path)}
                  className="hover:bg-muted rounded p-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {diffPath && (
              <div className="bg-background flex shrink-0 items-center gap-1.5 border-r px-3 py-1.5 text-sm">
                <GitCompare className="size-3.5" />
                <span className="max-w-48 truncate">Diff: {diffPath}</span>
                <button
                  onClick={() => setDiffPath(null)}
                  className="hover:bg-muted rounded p-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>

          {/* Editor / diff */}
          <div className="min-h-0 flex-1">
            {diffPath && diffFile ? (
              <DiffViewer
                path={diffFile.path}
                original={diffFile.originalContent}
                modified={diffFile.content}
              />
            ) : activeFile ? (
              <CodeEditor
                path={activeFile.path}
                value={activeFile.content}
                onChange={(v) => edit(activeFile.path, v)}
                onCursor={(line) => broadcastCursor(activeFile.path, line)}
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                Select a file from the explorer to start editing.
              </div>
            )}
          </div>

          {/* Live collaborators */}
          {Object.values(collaborators).length > 0 && (
            <div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-1 text-xs">
              {Object.values(collaborators).map((c) => (
                <span key={c.userId} className="flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {c.name} · {c.path.split("/").pop()}:{c.line}
                </span>
              ))}
            </div>
          )}

        </div>
      </div>

      <Dialog
        open={docs.open}
        onOpenChange={(o) => setDocs((d) => ({ ...d, open: o }))}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> Generated documentation
            </DialogTitle>
            <DialogDescription>
              AI-generated docs for {active ?? "the file"}.
            </DialogDescription>
          </DialogHeader>
          {docs.loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Generating…
            </p>
          ) : (
            <pre className="bg-muted/50 overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
              {docs.content}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Local tree builder mirroring lib/queries.buildTree for the client state.
function buildTree(files: RepoFile[]): TreeNode[] {
  const root: TreeNode[] = []
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of sorted) {
    const parts = file.path.split("/")
    let level = root
    let acc = ""
    parts.forEach((name, idx) => {
      acc = acc ? `${acc}/${name}` : name
      const isLeaf = idx === parts.length - 1
      let node = level.find((n) => n.name === name)
      if (!node) {
        node = {
          name,
          path: acc,
          type: isLeaf ? "file" : "dir",
          ...(isLeaf ? { status: file.status } : { children: [] }),
        }
        level.push(node)
      } else if (isLeaf) {
        node.status = file.status
      }
      if (!isLeaf) level = node.children!
    })
  }
  const sortLevel = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => n.children && sortLevel(n.children))
  }
  sortLevel(root)
  return root
}
