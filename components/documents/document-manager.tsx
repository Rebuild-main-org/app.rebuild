"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Download,
  File as FileIcon,
  FolderUp,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { UserAvatar } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"

interface DocMeta {
  id: string
  name: string
  mimeType: string
  size: number
  createdAt: string
  uploadedBy?: string
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function DocumentManager({
  workspaceId,
  projectId,
}: {
  workspaceId: string
  projectId?: string
}) {
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const query = new URLSearchParams({ workspaceId })
    if (projectId) query.set("projectId", projectId)
    const res = await fetch(`/api/documents?${query.toString()}`)
    if (res.ok) setDocs(await res.json())
  }, [workspaceId, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function upload(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setUploading(true)
    try {
      const payload = await Promise.all(
        files.map(async (f) => ({
          // webkitRelativePath preserves directory structure when a folder is picked
          name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
          mimeType: f.type,
          size: f.size,
          dataUrl: await readAsDataUrl(f),
        }))
      )
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, projectId, files: payload }),
      })
      if (!res.ok) throw new Error()
      const { count } = await res.json()
      toast.success(`Uploaded ${count} file${count === 1 ? "" : "s"}`)
      load()
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" })
    if (res.ok) {
      setDocs((d) => d.filter((x) => x.id !== id))
      toast.success("Deleted")
    } else toast.error("Could not delete")
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          upload(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted"
        }`}
      >
        <Upload className="text-muted-foreground size-6" />
        <p className="text-sm">
          Drag &amp; drop files here, or
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <FileIcon className="size-4" /> Choose files
          </Button>
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => dirInput.current?.click()}>
            <FolderUp className="size-4" /> Upload folder
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <input
          ref={dirInput}
          type="file"
          hidden
          // @ts-expect-error non-standard directory attributes
          webkitdirectory=""
          directory=""
          multiple
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        {uploading && <p className="text-muted-foreground text-xs">Uploading…</p>}
      </div>

      <div className="space-y-1.5">
        {docs.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No documents yet.
          </p>
        )}
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <FileIcon className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.name}</div>
              <div className="text-muted-foreground text-xs">
                {fmtSize(d.size)} · {new Date(d.createdAt).toLocaleDateString()}
              </div>
            </div>
            {d.uploadedBy && <UserAvatar name={d.uploadedBy} />}
            <a href={`/api/documents/${d.id}`} download>
              <Button variant="ghost" size="icon" className="size-8">
                <Download className="size-4" />
              </Button>
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive size-8"
              onClick={() => remove(d.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
