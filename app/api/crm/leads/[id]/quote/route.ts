import { randomUUID } from "crypto"

import { requireAuth } from "@/lib/auth/guard"
import { SEL, sb } from "@/lib/data"
import { AINotConfiguredError, quoteFromLead } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import type { Lead } from "@/lib/types"

// POST /api/crm/leads/:id/quote — AI-drafts a quote from the lead and saves it
// as a DRAFT finance doc. Returns the created quote.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("crm.manage")
  if (auth instanceof Response) return auth
  const { id } = await params
  const { data } = await sb().from("leads").select(SEL.lead).eq("id", id).maybeSingle()
  const lead = data as Lead | null
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 })

  try {
    const traceRef: { id?: string } = {}
    const draft = await withAi(
      auth,
      "quote",
      () =>
        quoteFromLead({
          company: lead.company,
          notes: lead.notes ?? "",
          targetValue: lead.value,
          currency: lead.currency || "TND",
        }),
      { workspaceId: lead.workspaceId, traceRef }
    )
    const year = new Date().getFullYear()
    const { count } = await sb().from("finance_docs").select("id", { count: "exact", head: true }).eq("kind", "QUOTE")
    const number = `DEV-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`
    const row = {
      id: randomUUID(),
      kind: "QUOTE",
      number,
      workspace_id: lead.workspaceId ?? null,
      client_name: lead.company,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      status: "DRAFT",
      items: draft.items,
      tax_rate: 19,
      currency: lead.currency || "TND",
      notes: draft.notes,
    }
    const { error } = await sb().from("finance_docs").insert(row)
    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ ...row, traceId: traceRef.id }, { status: 201 })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: e instanceof Error ? e.message : "Quote failed" }, { status: 502 })
  }
}
