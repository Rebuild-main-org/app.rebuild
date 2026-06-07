// Object storage (MUST-HAVE #3) — moves file bytes out of Postgres into
// Supabase Storage. Activates when STORAGE_BUCKET is set; otherwise callers
// fall back to inline base64 (data_url) so the app still runs un-provisioned.
//
// Setup: create a PRIVATE bucket in Supabase → Storage (default name
// "uploads"), set STORAGE_BUCKET=uploads, and run supabase/storage.sql to add
// the storage_path columns.

import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"

export function storageEnabled(): boolean {
  return !!process.env.STORAGE_BUCKET
}

function bucket(): string {
  return process.env.STORAGE_BUCKET as string
}

// Decode a data URL ("data:<mime>;base64,<payload>") into bytes.
export function decodeDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl)
  if (!match) return { mime: "application/octet-stream", bytes: Buffer.from("") }
  return { mime: match[1], bytes: Buffer.from(match[2], "base64") }
}

// Upload bytes to the bucket under `path`. Returns the stored path.
export async function uploadObject(
  path: string,
  bytes: Buffer | Uint8Array,
  mime: string
): Promise<string> {
  const { error } = await supabaseAdmin()
    .storage.from(bucket())
    .upload(path, bytes, { contentType: mime, upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return path
}

// Upload from a data URL; generates a namespaced path. Returns the path.
export async function uploadDataUrl(
  prefix: string,
  fileName: string,
  dataUrl: string
): Promise<string> {
  const { mime, bytes } = decodeDataUrl(dataUrl)
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${prefix}/${crypto.randomUUID()}-${safe}`
  return uploadObject(path, bytes, mime)
}

// Download object bytes (server-side streaming).
export async function downloadObject(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(bucket()).download(path)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)
  return Buffer.from(await data.arrayBuffer())
}

// A short-lived signed URL for direct client download (optional).
export async function signedUrl(path: string, expiresInSec = 300): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .storage.from(bucket())
    .createSignedUrl(path, expiresInSec)
  return data?.signedUrl ?? null
}

export async function removeObject(path: string): Promise<void> {
  await supabaseAdmin().storage.from(bucket()).remove([path])
}
