// App-wide settings stored in `app_settings` (key/value). Currently: the active
// AI model, which a SUPER_ADMIN can change for everyone from the admin panel.
// Read paths are cached briefly so they don't add a query to every AI call.

import "server-only"
import { sb } from "./data"

const AI_MODEL_KEY = "ai_model"

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

let cache: { value: string; at: number } | null = null
const TTL_MS = 60_000

// The active AI model for everyone (DB setting → env → Opus 4.8). Cached 60s.
export async function getAiModel(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  try {
    const { data } = await sb()
      .from("app_settings")
      .select("value")
      .eq("key", AI_MODEL_KEY)
      .maybeSingle()
    const value = (data?.value as string) || DEFAULT_AI_MODEL
    cache = { value, at: Date.now() }
    return value
  } catch {
    // settings table not migrated yet → fall back, don't break AI calls
    return DEFAULT_AI_MODEL
  }
}

// Persist the active model (SUPER_ADMIN only — enforced in the route). Updates
// the cache so the change takes effect immediately on this instance.
export async function setAiModel(model: string, updatedBy?: string): Promise<void> {
  if (!isKnownModel(model)) throw new Error("Unknown model")
  const { error } = await sb().from("app_settings").upsert(
    { key: AI_MODEL_KEY, value: model, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  )
  if (error) throw new Error(error.message)
  cache = { value: model, at: Date.now() }
}
