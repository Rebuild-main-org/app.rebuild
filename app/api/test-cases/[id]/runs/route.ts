import { randomUUID } from "crypto"

import { SEL, getUsersMap, sb } from "@/lib/data"
import { requireTestCase } from "@/lib/auth/guard"
import type { TestRunStatus } from "@/lib/types"

const STATUSES: TestRunStatus[] = ["PASS", "FAIL", "BLOCKED", "SKIPPED", "UNTESTED"]

// GET /api/test-cases/:id/runs — run history for a test case.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireTestCase(id)
  if (access instanceof Response) return access
  const [{ data }, users] = await Promise.all([
    sb().from("test_runs").select(SEL.testRun).eq("test_case_id", id).order("created_at", { ascending: false }),
    getUsersMap(),
  ])
  return Response.json((data ?? []).map((r) => ({ ...r, runBy: users.get(r.runById as string)?.name })))
}

// POST /api/test-cases/:id/runs — record a test execution result.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const access = await requireTestCase(id, "qa.manage")
  if (access instanceof Response) return access
  const { status, notes, ticketId } = (await request.json()) as {
    status?: TestRunStatus
    notes?: string
    ticketId?: string
  }
  if (!status || !STATUSES.includes(status)) {
    return Response.json({ error: "valid status required" }, { status: 400 })
  }
  const row = {
    id: randomUUID(),
    test_case_id: id,
    status,
    notes: notes ?? null,
    run_by_id: access.id,
    ticket_id: ticketId ?? null,
    created_at: new Date().toISOString(),
  }
  const { error } = await sb().from("test_runs").insert(row)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json(row, { status: 201 })
}
