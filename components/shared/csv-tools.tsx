"use client"

// Reusable CSV export/import controls.

import { useRef, useState } from "react"
import { Download, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { parseCsv } from "@/lib/csv"
import { Button } from "@/components/ui/button"

export function ExportButton({ href, label = "Export" }: { href: string; label?: string }) {
  return (
    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
      <a href={href} download>
        <Download className="size-3.5" /> {label}
      </a>
    </Button>
  )
}

export function ImportButton({
  endpoint,
  extra,
  onDone,
  label = "Import",
}: {
  endpoint: string
  extra?: Record<string, unknown>
  onDone?: () => void
  label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setBusy(true)
    try {
      const rows = parseCsv(await file.text())
      if (rows.length === 0) {
        toast.error("No rows found in file")
        return
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error ?? "Import failed")
      toast.success(`Imported ${data.imported} row(s)${data.skipped ? `, ${data.skipped} skipped` : ""}`)
      onDone?.()
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ""
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </>
  )
}
