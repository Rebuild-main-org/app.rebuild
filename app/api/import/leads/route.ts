import { randomUUID } from "crypto"

import { requireAuth } from "@/lib/auth/guard"
import { sb } from "@/lib/data"
import { LEAD_STAGES, type LeadStage } from "@/lib/types"

type Row = Record<string, string>
// Case-insensitive field lookup with aliases.
function field(row: Row, ...names: string[]): string {
  const lower: Record<string, string> = {}
  for (const k of Object.keys(row)) lower[k.toLowerCase().trim()] = row[k]
  for (const n of names) {
    const v = lower[n.toLowerCase()]
    if (v != null && v !== "") return v
  }
  return ""
}

// POST /api/import/leads — bulk-create leads from parsed CSV rows. crm.manage.
export async function POST(request: Request) {
  const auth = await requireAuth("crm.manage")
  if (auth instanceof Response) return auth
  const { rows } = (await request.json()) as { rows?: Row[] }
  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "No rows" }, { status: 400 })
  }
  if (rows.length > 1000) return Response.json({ error: "Too many rows (max 1000)" }, { status: 400 })

  const now = new Date().toISOString()
  const records = rows
    .map((r) => {
      const company = field(r, "company", "société", "societe", "name")
      if (!company) return null
      const stageRaw = field(r, "stage").toUpperCase()
      const stage: LeadStage = (LEAD_STAGES as string[]).includes(stageRaw) ? (stageRaw as LeadStage) : "LEAD"
      return {
        id: randomUUID(),
        company,
        contact_name: field(r, "contact", "contactName", "contact name"),
        contact_email: field(r, "email", "contactEmail", "contact email"),
        stage,
        value: Number(field(r, "value", "amount").replace(/[^0-9.]/g, "")) || 0,
        currency: field(r, "currency") || "TND",
        source: field(r, "source") || "Import",
        created_at: now,
        updated_at: now,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (records.length === 0) return Response.json({ error: "No valid rows (company required)" }, { status: 400 })
  const { error } = await sb().from("leads").insert(records)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ imported: records.length, skipped: rows.length - records.length }, { status: 201 })
}
