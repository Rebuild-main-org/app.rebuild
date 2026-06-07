import { randomUUID } from "crypto"

import { SEL, sb } from "@/lib/data"
import { requireProject } from "@/lib/auth/guard"

// GET /api/projects/:id/test-cases — test cases with their latest run status.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id)
  if (access instanceof Response) return access

  const { data: cases } = await sb()
    .from("test_cases")
    .select(SEL.testCase)
    .eq("project_id", id)
    .order("created_at", { ascending: false })
  const ids = (cases ?? []).map((c) => c.id as string)
  const latest: Record<string, string> = {}
  if (ids.length) {
    const { data: runs } = await sb()
      .from("test_runs")
      .select("test_case_id,status,created_at")
      .in("test_case_id", ids)
      .order("created_at", { ascending: false })
    for (const r of runs ?? []) {
      const k = r.test_case_id as string
      if (!latest[k]) latest[k] = r.status as string
    }
  }
  return Response.json(
    (cases ?? []).map((c) => ({ ...c, lastStatus: latest[c.id as string] ?? "UNTESTED" }))
  )
}

// POST /api/projects/:id/test-cases — create a test case.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireProject(id, "qa.manage")
  if (access instanceof Response) return access
  const { title, steps, expected } = (await request.json()) as {
    title?: string
    steps?: string
    expected?: string
  }
  if (!title?.trim()) return Response.json({ error: "title required" }, { status: 400 })
  const row = {
    id: randomUUID(),
    project_id: id,
    title: title.trim(),
    steps: steps ?? "",
    expected: expected ?? "",
    created_by_id: access.id,
    created_at: new Date().toISOString(),
  }
  const { error } = await sb().from("test_cases").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(row, { status: 201 })
}
