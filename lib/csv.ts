// Minimal RFC 4180 CSV helpers (no dependency). Used by import/export.

// Serialize rows (array of objects) to CSV given an ordered column list.
export function toCsv<T>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return ""
    const s = Array.isArray(v) ? v.join("; ") : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => esc(c.label)).join(",")
  const body = rows
    .map((r) => columns.map((c) => esc((r as Record<string, unknown>)[c.key as string])).join(","))
    .join("\n")
  return body ? `${header}\n${body}` : header
}

// Parse CSV text into rows keyed by the header row. Handles quoted fields,
// escaped quotes ("") and newlines inside quotes.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""))
  if (nonEmpty.length === 0) return []
  const header = nonEmpty[0].map((h) => h.trim())
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()))
    return obj
  })
}
