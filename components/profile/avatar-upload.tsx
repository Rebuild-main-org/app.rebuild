"use client"

// Avatar photo upload. Resizes client-side to a 256px square JPEG (kept small
// enough to store inline in profiles.avatar_url) and PATCHes /api/profile.

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { UserAvatar } from "@/components/shared/badges"
import { Button } from "@/components/ui/button"

const SIZE = 256

async function resizeToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext("2d")!
  // Cover crop (center).
  const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
  return canvas.toDataURL("image/jpeg", 0.85)
}

export function AvatarUpload({
  name,
  initialUrl,
}: {
  name: string
  initialUrl?: string
}) {
  const router = useRouter()
  const ref = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | undefined>(initialUrl)
  const [busy, setBusy] = useState(false)

  async function save(avatarUrl: string | null) {
    setBusy(true)
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl }),
    })
    setBusy(false)
    if (!res.ok) return toast.error("Could not update photo")
    setUrl(avatarUrl ?? undefined)
    toast.success(avatarUrl ? "Photo updated" : "Photo removed")
    router.refresh()
  }

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file")
    if (file.size > 8 * 1024 * 1024) return toast.error("Image too large (max 8 MB)")
    try {
      setBusy(true)
      const dataUrl = await resizeToDataUrl(file)
      await save(dataUrl)
    } catch {
      setBusy(false)
      toast.error("Could not process the image")
    }
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={name} src={url} size="md" className="size-16" />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload photo
          </Button>
          {url && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
              <X className="size-4" /> Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">JPG/PNG, cropped to a square.</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  )
}
