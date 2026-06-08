import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { AINotConfiguredError, extractSpecForm } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { getBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/extract { content } — turn a markdown brief/doc into
// the structured intake-wizard fields (fills the guided assistant).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "blueprints"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })

  const { content } = (await request.json().catch(() => ({}))) as { content?: string }
  if (!content?.trim() || content.trim().length < 20) {
    return Response.json({ error: "Document trop court" }, { status: 400 })
  }

  try {
    const form = await withAi(user, "spec-extract", () => extractSpecForm(content))
    return Response.json({ form })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: e instanceof Error ? e.message : "Extraction failed" }, { status: 502 })
  }
}
