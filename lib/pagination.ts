// Normalized pagination helpers (Sprint 2). Offset-based, capped, backward
// compatible: callers default to a sane page size when no params are present.

export interface Page {
  limit: number
  offset: number
}

export function parsePage(url: string, defLimit = 50, maxLimit = 100): Page {
  const sp = new URL(url).searchParams
  const rawLimit = Number(sp.get("limit"))
  const rawOffset = Number(sp.get("offset"))
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defLimit, 1), maxLimit)
  const offset = Math.max(Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0, 0)
  return { limit, offset }
}

// Inclusive [from, to] bounds for Supabase `.range()`.
export function pageRange(p: Page): [number, number] {
  return [p.offset, p.offset + p.limit - 1]
}

// Wrap a page of rows with cursor metadata for clients.
export function paged<T>(items: T[], p: Page): { items: T[]; nextOffset: number | null; limit: number } {
  const hasMore = items.length === p.limit
  return { items, nextOffset: hasMore ? p.offset + p.limit : null, limit: p.limit }
}
