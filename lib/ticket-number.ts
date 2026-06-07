// Pure fallback ticket-number allocator (used when the atomic SQL counter
// `next_ticket_number` isn't available). Derives the next sequence from the
// existing short ids, e.g. ["ACME-101","ACME-103"] -> 104.

export function nextTicketNumberFromShortIds(shortIds: string[], base = 100): number {
  const max = shortIds.reduce((m, s) => {
    const n = Number(String(s).split("-")[1] ?? 0)
    return Math.max(m, Number.isNaN(n) ? 0 : n)
  }, base)
  return max + 1
}
