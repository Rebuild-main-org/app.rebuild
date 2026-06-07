// Lightweight in-process rate limiter (MUST-HAVE #4).
//
// Sliding-window counter keyed by an arbitrary identifier (user id, IP, route).
// This protects a single instance; for a multi-instance / serverless fleet,
// back it with Upstash Redis (see rateLimitRedis stub note in docs) — the call
// sites here stay identical.

interface Window {
  count: number
  resetAt: number
}

const buckets = new Map<string, Window>()

// Sweep expired buckets occasionally to bound memory.
let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k)
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

// Allow `limit` requests per `windowMs` for a given key.
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const w = buckets.get(key)
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 }
  }
  if (w.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) }
  }
  w.count += 1
  return { ok: true, remaining: limit - w.count, retryAfterSec: 0 }
}

// Convenience: returns a 429 Response when over the limit, else null.
export function rateLimitResponse(
  key: string,
  limit: number,
  windowMs: number
): Response | null {
  const r = rateLimit(key, limit, windowMs)
  if (r.ok) return null
  return Response.json(
    { error: "Rate limit exceeded. Please slow down." },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } }
  )
}
