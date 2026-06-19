// Signed client-portal tokens. HMAC-signed so the portal can't be enumerated.
//
// Token format: <wsId>.<expSeconds>.<base64url(hmac_sha256(`${wsId}.${exp}`, secret))>
//
// Secret: CLIENT_PORTAL_SECRET — now REQUIRED and DISTINCT. The old fallbacks
// (the service-role key, then a literal "insecure-dev-secret") are removed:
//   - falling back to the service-role key coupled token validity to that key,
//     so rotating one silently broke the other (and vice-versa);
//   - the literal default would sign forgeable tokens in any misconfigured env.
// Tokens now also EXPIRE (default 30 days), so a leaked link doesn't live forever.

import "server-only"
import { createHmac, timingSafeEqual } from "crypto"

const DEFAULT_TTL_DAYS = 30

function secret(): string {
  const s = process.env.CLIENT_PORTAL_SECRET
  if (!s || s.length < 16) {
    throw new Error(
      "CLIENT_PORTAL_SECRET must be set (>= 16 chars) and distinct from the service-role key"
    )
  }
  return s
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function signPortalToken(wsId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400
  const payload = `${wsId}.${exp}`
  return `${payload}.${sign(payload)}`
}

// Returns the workspace id if the token is valid AND unexpired, else null.
export function verifyPortalToken(token: string): string | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [wsId, expStr, sig] = parts
  const exp = Number(expStr)
  if (!wsId || !Number.isFinite(exp)) return null
  if (exp < Math.floor(Date.now() / 1000)) return null // expired
  const expected = sign(`${wsId}.${exp}`)
  try {
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return wsId
    }
  } catch {
    /* fall through */
  }
  return null
}
