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
  return tooMany(r)
}

function tooMany(r: RateLimitResult): Response {
  return Response.json(
    { error: "Rate limit exceeded. Please slow down." },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } }
  )
}

// --- tenant-aware, shared-store-ready limiter --------------------------------
// In multi-tenant the limiter MUST be keyed by org (one tenant can't exhaust
// another's budget — §1.4 noisy-neighbour / AI cost amplification) AND must work
// across a serverless fleet. The in-process Map above is per-lambda, so on Vercel
// it barely limits anything. `rateLimitAsync` uses Upstash Redis REST when
// configured (shared across instances) and degrades to the in-process limiter
// for local/dev/test — the limiter must never break a request.

// Namespace a limit to a tenant. Always prefix tenant-scoped limits with the org.
export function tenantKey(orgId: string, route: string): string {
  return `org:${orgId}:${route}`
}

function upstashConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!upstashConfigured()) return rateLimit(key, limit, windowMs)
  const base = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!
  try {
    // One round-trip: INCR the counter, set TTL only on the first hit (NX).
    const res = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, String(windowMs), "NX"],
      ]),
    })
    if (!res.ok) return rateLimit(key, limit, windowMs) // degrade gracefully
    const out = (await res.json()) as { result?: unknown }[]
    const count = Number(out?.[0]?.result ?? 0)
    if (count > limit) {
      return { ok: false, remaining: 0, retryAfterSec: Math.ceil(windowMs / 1000) }
    }
    return { ok: true, remaining: Math.max(0, limit - count), retryAfterSec: 0 }
  } catch {
    return rateLimit(key, limit, windowMs) // never let the limiter break the request
  }
}

// Async 429 helper (Upstash-backed when configured).
export async function rateLimitResponseAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<Response | null> {
  const r = await rateLimitAsync(key, limit, windowMs)
  return r.ok ? null : tooMany(r)
}
