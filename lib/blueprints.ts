// Phase A (Conception) blueprints — server data access (service-role) + the
// deterministic spec validation gate. Client-safe types/constants/helpers live
// in ./blueprint-types and are re-exported here for server callers.

import "server-only"
import { randomUUID } from "crypto"
import { sb } from "./data"
import type { Blueprint } from "./blueprint-types"

export * from "./blueprint-types"

const SEL_BLUEPRINT =
  "id,title,status,specYaml:spec_yaml,answers,critique,plan,feasibility,designDoc:design_doc,acceptanceYaml:acceptance_yaml,prereqs,gates,documents,figmaUrl:figma_url,workspaceId:workspace_id,createdBy:created_by,createdAt:created_at,updatedAt:updated_at"

export async function listBlueprints(): Promise<Blueprint[]> {
  const { data } = await sb().from("blueprints").select(SEL_BLUEPRINT).order("created_at", { ascending: false })
  return (data ?? []) as Blueprint[]
}

export async function getBlueprint(id: string): Promise<Blueprint | null> {
  const { data } = await sb().from("blueprints").select(SEL_BLUEPRINT).eq("id", id).maybeSingle()
  return (data as Blueprint | null) ?? null
}

export async function createBlueprint(input: {
  title: string
  specYaml?: string
  createdBy?: string
}): Promise<Blueprint> {
  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    title: input.title,
    status: "DRAFT",
    spec_yaml: input.specYaml ?? "",
    gates: {},
    prereqs: {},
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now,
  }
  const { data, error } = await sb().from("blueprints").insert(row).select(SEL_BLUEPRINT).single()
  if (error) throw new Error(error.message)
  return data as Blueprint
}

// snake_case patch; only the provided columns are written. Always bumps updated_at.
export async function updateBlueprint(
  id: string,
  patch: Record<string, unknown>
): Promise<Blueprint | null> {
  const { data, error } = await sb()
    .from("blueprints")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SEL_BLUEPRINT)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Blueprint | null) ?? null
}

export async function deleteBlueprint(id: string): Promise<void> {
  await sb().from("blueprints").delete().eq("id", id)
}

// --- Deterministic spec validation (the hard schema/completeness gate) -------
// No YAML dependency: a heuristic presence check for the sections a buildable
// spec must declare. Returns the missing items; ok=true when none are missing.
export interface SpecValidation {
  ok: boolean
  present: string[]
  missing: string[]
}

const REQUIRED_SECTIONS: { label: string; test: (s: string) => boolean }[] = [
  { label: "NFR (scale, latence, SLO, consistance, rétention)", test: (s) => /\bnfr\b/i.test(s) },
  { label: "Budgets de latence", test: (s) => /latency|p99|p95|budget/i.test(s) },
  { label: "Échelle / volumétrie (rps, lignes)", test: (s) => /scale|rps|throughput|rows|qps/i.test(s) },
  { label: "SLO / disponibilité + error budget", test: (s) => /slo|availability|error_budget|uptime/i.test(s) },
  { label: "Consistance par domaine", test: (s) => /consistency|strong|eventual/i.test(s) },
  { label: "Entités de données", test: (s) => /\b(data|entities|entity)\b/i.test(s) },
  { label: "Patterns d'accès", test: (s) => /access_patterns?/i.test(s) },
  { label: "Intégrations", test: (s) => /integrations?/i.test(s) },
  { label: "Modes de défaillance (on_failure)", test: (s) => /on_failure|fallback|circuit|retry|timeout/i.test(s) },
  { label: "Conformité (GDPR / PCI…)", test: (s) => /compliance|gdpr|pci|hipaa|soc2/i.test(s) },
  { label: "Stack & cible de déploiement", test: (s) => /stack|deploy|runtime/i.test(s) },
  { label: "Quality gates", test: (s) => /quality_gates?|acceptance|coverage/i.test(s) },
]

export function validateSpec(specYaml: string): SpecValidation {
  const s = specYaml || ""
  const present: string[] = []
  const missing: string[] = []
  if (s.trim().length < 40) {
    return { ok: false, present, missing: REQUIRED_SECTIONS.map((r) => r.label) }
  }
  for (const r of REQUIRED_SECTIONS) (r.test(s) ? present : missing).push(r.label)
  return { ok: missing.length === 0, present, missing }
}
