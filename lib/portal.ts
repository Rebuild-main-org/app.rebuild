// Signed client-portal tokens (Fix C). Replaces the guessable workspace
// slug/id with an HMAC-signed token so the portal can't be enumerated.
//
// Token format: <wsId>.<base64url(hmac_sha256(wsId, secret))>
// Secret: CLIENT_PORTAL_SECRET, falling back to the service-role key.

import "server-only"
import { createHmac, timingSafeEqual } from "crypto"

function secret(): string {
  return (
    process.env.CLIENT_PORTAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "insecure-dev-secret"
  )
}

function sign(wsId: string): string {
  return createHmac("sha256", secret()).update(wsId).digest("base64url")
}

export function signPortalToken(wsId: string): string {
  return `${wsId}.${sign(wsId)}`
}

// Returns the workspace id if the token is valid, else null.
export function verifyPortalToken(token: string): string | null {
  const idx = token.lastIndexOf(".")
  if (idx <= 0) return null
  const wsId = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = sign(wsId)
  try {
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return wsId
    }
  } catch {
    /* fall through */
  }
  return null
}
