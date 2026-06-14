// Curated dataset export (Ticket 4). Joins human feedback (ai_feedback) with the
// traced prompt/response (Langfuse) and emits JSONL rows for later DSPy prompt
// optimization / optional distillation. Export only — no training here.
//
// The IO comes from Langfuse, so meaningful input/output requires Langfuse with
// LANGFUSE_CAPTURE_IO=1. Without it the rows still carry feature/score/note
// (input/output null) — the export degrades gracefully.
import "server-only"

import { aiFeedback } from "../queries"
import { fetchTraceIO, langfuseEnabled } from "./langfuse"

export interface DatasetRow {
  feature: string
  promptVersion: string | null
  input: unknown
  output: unknown
  score: number
  note: string | null
}

export interface DatasetFilter {
  feature?: string
  workspaceId?: string
  since?: string
  minScore?: number
}

// Build the dataset rows. One row per feedback entry, enriched with the trace IO
// when Langfuse is reachable. Caps the number of Langfuse lookups to stay snappy.
export async function buildDataset(filter: DatasetFilter, limit = 1000): Promise<DatasetRow[]> {
  const feedback = (await aiFeedback(filter)).slice(0, limit)
  const lf = langfuseEnabled()
  const rows: DatasetRow[] = []
  for (const f of feedback) {
    const io = lf ? await fetchTraceIO(f.traceId) : null
    rows.push({
      feature: f.feature,
      promptVersion: io?.promptVersion ?? null,
      input: io?.input ?? null,
      output: io?.output ?? null,
      score: f.score,
      note: f.note ?? null,
    })
  }
  return rows
}

// JSONL (newline-delimited JSON) — one object per line.
export function toJsonl(rows: DatasetRow[]): string {
  return rows.length ? rows.map((r) => JSON.stringify(r)).join("\n") + "\n" : ""
}
