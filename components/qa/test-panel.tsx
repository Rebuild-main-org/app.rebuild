"use client"

// QA test management panel (SHOULD). Lists test cases with their latest run
// status, lets QA author cases and record runs. Backed by /api/projects/:id/
// test-cases and /api/test-cases/:id/runs.

import { useEffect, useState } from "react"
import { Plus, Play, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { TEST_RUN_META, type TestRunStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface TestCaseRow {
  id: string
  title: string
  steps: string
  expected: string
  lastStatus: TestRunStatus
}

const RUN_STATUSES: TestRunStatus[] = ["PASS", "FAIL", "BLOCKED", "SKIPPED"]

export function TestPanel({ projectId }: { projectId: string }) {
  const [cases, setCases] = useState<TestCaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [steps, setSteps] = useState("")
  const [expected, setExpected] = useState("")
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await fetch(`/api/projects/${projectId}/test-cases`)
    if (r.ok) setCases(await r.json())
    setLoading(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function create() {
    if (!title.trim()) return
    setSaving(true)
    const r = await fetch(`/api/projects/${projectId}/test-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, steps, expected }),
    })
    setSaving(false)
    if (!r.ok) return toast.error((await r.json()).error ?? "Failed")
    setTitle("")
    setSteps("")
    setExpected("")
    setOpen(false)
    load()
  }

  async function recordRun(caseId: string, status: TestRunStatus) {
    const r = await fetch(`/api/test-cases/${caseId}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!r.ok) return toast.error((await r.json()).error ?? "Failed")
    toast.success(`Marked ${TEST_RUN_META[status].label}`)
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, lastStatus: status } : c)))
  }

  const passed = cases.filter((c) => c.lastStatus === "PASS").length
  const failed = cases.filter((c) => c.lastStatus === "FAIL").length

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Test cases</h2>
          <p className="text-muted-foreground text-sm">
            {cases.length} cases · {passed} passing · {failed} failing
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="size-4" /> New test case
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New test case</DialogTitle>
              <DialogDescription>Describe the steps and the expected result.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="Steps to reproduce" value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} />
              <Textarea placeholder="Expected result" value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} />
              <Button onClick={create} disabled={saving || !title.trim()} className="w-full">
                {saving && <Loader2 className="size-4 animate-spin" />} Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : cases.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No test cases yet.
        </p>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={TEST_RUN_META[c.lastStatus].color}>
                      {TEST_RUN_META[c.lastStatus].label}
                    </Badge>
                    <span className="font-medium">{c.title}</span>
                  </div>
                  {c.steps && <p className="text-muted-foreground mt-1 whitespace-pre-wrap text-xs">{c.steps}</p>}
                  {c.expected && (
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">Expected: </span>
                      {c.expected}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {RUN_STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => recordRun(c.id, s)}
                    >
                      <Play className="size-3" /> {TEST_RUN_META[s].label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
