"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AiFeedback } from "@/components/ai/ai-feedback"

export function ProjectSummary({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    const res = await fetch("/api/ai/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "project", projectId }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    setSummary(res.ok ? data.summary : "Could not generate summary.")
    setTraceId(res.ok ? data.traceId : undefined)
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> AI summary
          </CardTitle>
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            {loading ? "Generating…" : summary ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <>
            <p className="text-sm whitespace-pre-wrap">{summary}</p>
            {traceId && <AiFeedback className="mt-3" traceId={traceId} feature="summary" />}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Generate a plain-language status summary of this project for a client
            or stand-up.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
