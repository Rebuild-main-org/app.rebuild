import { requireProject } from "@/lib/auth/guard"
import { createTicket } from "@/lib/mutations"
import {
  type StoryPoints,
  type TicketPriority,
  type TicketType,
} from "@/lib/types"

type Row = Record<string, string>
function field(row: Row, ...names: string[]): string {
  const lower: Record<string, string> = {}
  for (const k of Object.keys(row)) lower[k.toLowerCase().trim()] = row[k]
  for (const n of names) {
    const v = lower[n.toLowerCase()]
    if (v != null && v !== "") return v
  }
  return ""
}

const TYPES: TicketType[] = ["TASK", "BUG", "FEATURE", "REVIEW", "EPIC", "SPIKE", "SUBTASK"]
const PRIORITIES: TicketPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
const POINTS = new Set([1, 2, 3, 5, 8, 13])

// POST /api/import/tickets — bulk-create tickets in a project from CSV rows.
export async function POST(request: Request) {
  const { projectId, rows } = (await request.json()) as { projectId?: string; rows?: Row[] }
  const access = await requireProject(projectId)
  if (access instanceof Response) return access
  if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: "No rows" }, { status: 400 })
  if (rows.length > 500) return Response.json({ error: "Too many rows (max 500)" }, { status: 400 })

  let imported = 0
  let skipped = 0
  for (const r of rows) {
    const title = field(r, "title", "titre", "summary")
    if (!title) {
      skipped++
      continue
    }
    const type = field(r, "type").toUpperCase()
    const priority = field(r, "priority", "priorité", "priorite").toUpperCase()
    const pts = Number(field(r, "points"))
    try {
      await createTicket(projectId!, {
        title,
        description: field(r, "description"),
        type: (TYPES as string[]).includes(type) ? (type as TicketType) : "TASK",
        priority: (PRIORITIES as string[]).includes(priority) ? (priority as TicketPriority) : "MEDIUM",
        status: "TODO",
        points: POINTS.has(pts) ? (pts as StoryPoints) : undefined,
      })
      imported++
    } catch {
      skipped++
    }
  }
  return Response.json({ imported, skipped }, { status: 201 })
}
