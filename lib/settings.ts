// App-wide settings stored in `app_settings` (key/value). A SUPER_ADMIN sets
// them for everyone from the admin panel. Two model settings:
//   - `ai_model`  : the server AI (review, triage, scaffold, copilot…)
//   - `cli_model` : the rebuild216 CLI / agent engine
// Read paths are cached briefly so they don't add a query to every call.

import "server-only"
import { sb } from "./data"

// The compile-time default (env override, else Opus 4.8). Used when no DB value
// is set or the settings table isn't reachable.
export const DEFAULT_AI_MODEL = process.env.AI_MODEL ?? "claude-opus-4-8"

// Models a SUPER_ADMIN may select. Keep ids exact (no date suffixes).
export const AI_MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
]

export function isKnownModel(model: string): boolean {
  return AI_MODELS.some((m) => m.id === model)
}

// --- generic key/value with a short per-key cache --------------------------

const TTL_MS = 60_000
const cache = new Map<string, { value: string; at: number }>()

async function getSetting(key: string, fallback: string): Promise<string> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  try {
    const { data } = await sb().from("app_settings").select("value").eq("key", key).maybeSingle()
    const value = (data?.value as string) || fallback
    cache.set(key, { value, at: Date.now() })
    return value
  } catch {
    // settings table not migrated yet → fall back, don't break callers
    return fallback
  }
}

async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  const { error } = await sb().from("app_settings").upsert(
    { key, value, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  )
  if (error) throw new Error(error.message)
  cache.set(key, { value, at: Date.now() })
}

// --- AI model (server) ------------------------------------------------------

export async function getAiModel(): Promise<string> {
  return getSetting("ai_model", DEFAULT_AI_MODEL)
}
export async function setAiModel(model: string, updatedBy?: string): Promise<void> {
  if (!isKnownModel(model)) throw new Error("Unknown model")
  await setSetting("ai_model", model, updatedBy)
}

// --- CLI model (rebuild216 / agent engine) ----------------------------------

export async function getCliModel(): Promise<string> {
  return getSetting("cli_model", DEFAULT_AI_MODEL)
}
export async function setCliModel(model: string, updatedBy?: string): Promise<void> {
  if (!isKnownModel(model)) throw new Error("Unknown model")
  await setSetting("cli_model", model, updatedBy)
}
