// BYOK secret vault — envelope encryption (Phase 3).
//
// Each provider key is encrypted with AES-256-GCM under a per-ORG data key
// derived from SECRETS_MASTER_KEY via HKDF(org_id). The plaintext is decrypted
// only in memory at call time and NEVER read back to a client — callers get the
// key to make a provider request, or only last4/health metadata for the UI.
//
// Stored ciphertext (base64): [12B iv][16B GCM tag][N ciphertext].

import "server-only"
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"

function masterKey(): Buffer {
  const k = process.env.SECRETS_MASTER_KEY
  if (!k || k.length < 32) {
    throw new Error("SECRETS_MASTER_KEY must be set (>= 32 chars) for the BYOK vault")
  }
  return Buffer.from(k)
}

// Per-org 256-bit data key derived from the master (envelope encryption).
function orgKey(orgId: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterKey(), Buffer.from(orgId), Buffer.from("org-secret"), 32)
  )
}

export function encryptSecret(orgId: string, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", orgKey(orgId), iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString("base64")
}

export function decryptSecret(orgId: string, ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", orgKey(orgId), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

// Store/replace a provider secret for an org. Never returns the plaintext.
export async function putSecret(
  orgId: string,
  provider: string,
  plaintext: string,
  createdBy?: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("org_secrets")
    .upsert(
      {
        org_id: orgId,
        provider,
        ciphertext: encryptSecret(orgId, plaintext),
        last4: plaintext.slice(-4),
        health: "unknown",
        created_by: createdBy ?? null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" }
    )
  if (error) throw new Error(error.message)
}

// Decrypt a provider secret for a server call (in memory only). Returns undefined
// when absent — callers fall back to the platform key / heuristics (§2.3).
export async function getSecret(orgId: string, provider: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin()
    .from("org_secrets")
    .select("ciphertext")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle()
  if (!data?.ciphertext) return undefined
  try {
    const plaintext = decryptSecret(orgId, data.ciphertext as string)
    // best-effort last_used_at touch (never blocks the call)
    void supabaseAdmin()
      .from("org_secrets")
      .update({ last_used_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("provider", provider)
    return plaintext
  } catch {
    return undefined
  }
}

export interface SecretMeta {
  provider: string
  last4: string | null
  health: string
}

// Metadata only (last4 + health) for the connect-key UI — no ciphertext.
export async function listSecretMeta(orgId: string): Promise<SecretMeta[]> {
  const { data } = await supabaseAdmin()
    .from("org_secrets")
    .select("provider,last4,health")
    .eq("org_id", orgId)
  return (data ?? []) as SecretMeta[]
}
