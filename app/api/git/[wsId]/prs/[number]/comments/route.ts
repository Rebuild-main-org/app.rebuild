import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { SEL, sb } from "@/lib/data"
import { emit } from "@/lib/events"
import { requireWorkspace } from "@/lib/auth/guard"

// POST — add a PR comment (general, or line-level with path+line).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; number: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { wsId, number } = await params
  const _access = await requireWorkspace(wsId)
  if (_access instanceof Response) return _access
  const { data: pr } = await sb().from("pull_requests").select(SEL.pr).eq("workspace_id", wsId).eq("number", Number(number)).maybeSingle()
  if (!pr) return Response.json({ error: "Not found" }, { status: 404 })

  const { body, path, line } = (await request.json()) as { body?: string; path?: string; line?: number }
  if (!body?.trim()) return Response.json({ error: "body required" }, { status: 400 })
  const { error } = await sb().from("pr_comments").insert({
    id: randomUUID(),
    pr_id: pr.id,
    author_id: user.id,
    path: path ?? null,
    line: line ?? null,
    body: body.trim(),
    created_at: new Date().toISOString(),
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })
  emit(`ws:${wsId}`, "pr.updated", { pr }, user.id)
  return Response.json({ ok: true }, { status: 201 })
}
