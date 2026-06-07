"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
} from "lucide-react"

import { FILE_STATUS_META, type TreeNode } from "@/lib/types"
import { cn } from "@/lib/utils"

function FileGlyph({ name }: { name: string }) {
  const className = "text-muted-foreground size-4 shrink-0"
  if (name.endsWith(".json")) return <FileJson className={className} />
  if (name.endsWith(".md")) return <FileText className={className} />
  if (/\.(tsx?|jsx?|css|mjs)$/.test(name)) return <FileCode className={className} />
  return <File className={className} />
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title="Delete"
      className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground mr-1 shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

function Node({
  node,
  depth,
  activePath,
  onOpen,
  onMove,
  onDelete,
}: {
  node: TreeNode
  depth: number
  activePath: string | null
  onOpen: (path: string) => void
  onMove?: (from: string, toDir: string) => void
  onDelete?: (path: string, isDir: boolean) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  const [dragOver, setDragOver] = useState(false)
  const pad = { paddingLeft: `${depth * 12 + 8}px` }

  if (node.type === "dir") {
    const Icon = open ? FolderOpen : Folder
    const Chevron = open ? ChevronDown : ChevronRight
    return (
      <div
        onDragOver={onMove ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
        onDragLeave={onMove ? () => setDragOver(false) : undefined}
        onDrop={
          onMove
            ? (e) => {
                e.preventDefault()
                setDragOver(false)
                const from = e.dataTransfer.getData("text/path")
                if (from) onMove(from, node.path)
              }
            : undefined
        }
        className={cn(dragOver && "bg-primary/10 rounded-sm")}
      >
        <div className="group hover:bg-muted/60 flex w-full items-center">
          <button
            onClick={() => setOpen((o) => !o)}
            style={pad}
            className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-sm"
          >
            <Chevron className="text-muted-foreground size-3.5 shrink-0" />
            <Icon className="size-4 shrink-0 text-sky-500" />
            <span className="truncate">{node.name}</span>
          </button>
          {onDelete && <DeleteButton onClick={() => onDelete(node.path, true)} />}
        </div>
        {open &&
          node.children?.map((child) => (
            <Node key={child.path} node={child} depth={depth + 1} activePath={activePath} onOpen={onOpen} onMove={onMove} onDelete={onDelete} />
          ))}
      </div>
    )
  }

  const status = node.status ?? "unmodified"
  const meta = FILE_STATUS_META[status]
  return (
    <div
      className={cn(
        "group hover:bg-muted/60 flex w-full items-center",
        activePath === node.path && "bg-muted"
      )}
    >
      <button
        draggable={!!onMove}
        onDragStart={onMove ? (e) => e.dataTransfer.setData("text/path", node.path) : undefined}
        onClick={() => onOpen(node.path)}
        style={pad}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-sm"
      >
        <span className="w-3.5 shrink-0" />
        <FileGlyph name={node.name} />
        <span
          className={cn(
            "truncate",
            status === "modified" && "text-amber-600 dark:text-amber-400",
            (status === "added" || status === "untracked") && "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {node.name}
        </span>
        {meta.letter && <span className={cn("ml-auto text-xs font-bold", meta.color)}>{meta.letter}</span>}
      </button>
      {onDelete && <DeleteButton onClick={() => onDelete(node.path, false)} />}
    </div>
  )
}

export function FileTree({
  tree,
  activePath,
  onOpen,
  onMove,
  onDelete,
}: {
  tree: TreeNode[]
  activePath: string | null
  onOpen: (path: string) => void
  onMove?: (from: string, toDir: string) => void
  onDelete?: (path: string, isDir: boolean) => void
}) {
  const [rootOver, setRootOver] = useState(false)
  return (
    <div
      className={cn("min-h-full py-1", rootOver && "bg-primary/5")}
      // Drop on empty area → move to repo root.
      onDragOver={onMove ? (e) => { e.preventDefault(); setRootOver(true) } : undefined}
      onDragLeave={onMove ? () => setRootOver(false) : undefined}
      onDrop={
        onMove
          ? (e) => {
              e.preventDefault()
              setRootOver(false)
              const from = e.dataTransfer.getData("text/path")
              if (from) onMove(from, "")
            }
          : undefined
      }
    >
      {tree.map((node) => (
        <Node key={node.path} node={node} depth={0} activePath={activePath} onOpen={onOpen} onMove={onMove} onDelete={onDelete} />
      ))}
    </div>
  )
}
