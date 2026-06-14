"use client"

import { useState } from "react"
import { Download, FileText } from "lucide-react"
import { toast } from "sonner"

import type { Report, ReportType } from "@/lib/reports"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const TYPES: { value: ReportType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "sprint", label: "Sprint" },
  { value: "release", label: "Release" },
]

export function ReportViewer({
  workspaces,
}: {
  workspaces: { id: string; name: string }[]
}) {
  const [type, setType] = useState<ReportType>("weekly")
  const [wsId, setWsId] = useState(workspaces[0]?.id ?? "")
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    if (!wsId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/reports?type=${type}&workspaceId=${wsId}`)
      if (!res.ok) throw new Error(String(res.status))
      setReport(await res.json())
    } catch {
      toast.error("Could not generate the report. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label} report
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={wsId} onValueChange={setWsId}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={generate} disabled={loading || !wsId}>
          <FileText className="size-4" /> {loading ? "Generating…" : "Generate"}
        </Button>
        {report && (
          <a href={`/api/reports?type=${type}&workspaceId=${wsId}&format=md`} download>
            <Button size="sm" variant="outline">
              <Download className="size-4" /> Markdown
            </Button>
          </a>
        )}
      </div>

      {!report && !loading && (
        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <FileText className="size-7 opacity-40" />
          <p className="text-sm font-medium">No report generated yet</p>
          <p className="text-xs">Pick a type and workspace above, then hit Generate to preview and export it.</p>
        </div>
      )}

      {report && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">{report.title}</h2>
              <p className="text-muted-foreground text-xs">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </p>
            </div>
            {report.sections.map((s) => (
              <div key={s.heading}>
                <h3 className="text-sm font-medium">{s.heading}</h3>
                {s.lines.length ? (
                  <ul className="text-muted-foreground mt-1 list-inside list-disc text-sm">
                    {s.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground mt-1 text-sm italic">none</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
