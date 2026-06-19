// GitHub App (Phase 3) — the multi-tenant replacement for the single GITHUB_TOKEN.
// Each org installs the App; we mint short-lived INSTALLATION tokens on demand
// from the App private key (no stored long-lived token). Dependency-free: the
// App JWT (RS256) is signed with node crypto, then exchanged via the REST API.
//
// Env: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM, "\n" allowed).

import "server-only"
import { createSign } from "crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"

export function githubAppEnabled(): boolean {
  return !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY)
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

// Short-lived App JWT (RS256, ~9 min) used only to call the installations API.
function appJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID })
  )
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  signer.end()
  const pem = (process.env.GITHUB_APP_PRIVATE_KEY as string).replace(/\\n/g, "\n")
  return `${header}.${payload}.${b64url(signer.sign(pem))}`
}

// Exchange the org's stored installation id for a short-lived installation token.
export async function installationToken(orgId: string): Promise<string | null> {
  if (!githubAppEnabled()) return null
  const { data } = await supabaseAdmin()
    .from("org_github_installations")
    .select("installation_id")
    .eq("org_id", orgId)
    .maybeSingle()
  const installationId = data?.installation_id
  if (!installationId) return null
  try {
    const res = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      { method: "POST", headers: { Authorization: `Bearer ${appJwt()}`, Accept: "application/vnd.github+json" } }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { token?: string }
    return json.token ?? null
  } catch {
    return null
  }
}

// Persist an installation (called from the GitHub App setup callback).
export async function saveInstallation(
  orgId: string,
  installationId: number,
  accountLogin?: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("org_github_installations")
    .upsert(
      { org_id: orgId, installation_id: installationId, account_login: accountLogin ?? null },
      { onConflict: "org_id" }
    )
  if (error) throw new Error(error.message)
}
