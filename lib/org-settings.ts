// Per-org settings (Phase 3) — the tenant-scoped replacement for the single
// global app_settings (lib/settings.ts). Read/written via the service-role admin
// path with an explicit org_id filter (control-plane values).

import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { DEFAULT_AI_MODEL, isKnownModel } from "@/lib/settings"

export async function getOrgSetting(orgId: string, key: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin()
      .from("org_settings")
      .select("value")
      .eq("org_id", orgId)
      .eq("key", key)
      .maybeSingle()
    return (data?.value as string) || fallback
  } catch {
    return fallback // table not migrated yet → don't break callers
  }
}

export async function setOrgSetting(
  orgId: string,
  key: string,
  value: string,
  updatedBy?: string
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("org_settings")
    .upsert(
      { org_id: orgId, key, value, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
      { onConflict: "org_id,key" }
    )
  if (error) throw new Error(error.message)
}

// AI model per org (falls back to the platform default).
export async function getOrgAiModel(orgId: string): Promise<string> {
  return getOrgSetting(orgId, "ai_model", DEFAULT_AI_MODEL)
}
export async function setOrgAiModel(orgId: string, model: string, updatedBy?: string): Promise<void> {
  if (!isKnownModel(model)) throw new Error("Unknown model")
  await setOrgSetting(orgId, "ai_model", model, updatedBy)
}

// Per-org monthly AI budget cap (USD) for the PLATFORM key. null = use the
// platform default (AI_MONTHLY_BUDGET_USD).
export async function getOrgBudgetUsd(orgId: string): Promise<number | null> {
  const raw = await getOrgSetting(orgId, "ai_budget_usd", "")
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}
