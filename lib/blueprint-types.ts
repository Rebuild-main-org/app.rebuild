// Client-safe blueprint types, constants and pure helpers (no server-only deps),
// shared by the UI and the server module (lib/blueprints.ts re-exports these).

import type { SpecCritiqueResult, ScaffoldPlan } from "./ai" // type-only (erased)

export type BlueprintStatus = "DRAFT" | "APPROVED" | "CONVERTED"

export type GateKey =
  | "validate"
  | "critique"
  | "feasibility"
  | "design"
  | "budgets"
  | "prereqs"
  | "plan"

// Human-toggled gates (the rest are produced by an endpoint).
export const HUMAN_GATES: GateKey[] = ["feasibility", "design", "budgets", "prereqs"]

// Manual gates + the deterministic/AI ones, minus `plan` (kept separate below).
export const GATE_KEYS: GateKey[] = [
  "validate",
  "critique",
  "feasibility",
  "design",
  "budgets",
  "prereqs",
]
// Every gate required before approval (plan included).
export const ALL_GATES: GateKey[] = [...GATE_KEYS, "plan"]

export const BLUEPRINT_STEPS: {
  key: string
  label: string
  gate: GateKey | null
  kind: "intake" | "auto" | "manual"
}[] = [
  { key: "intake", label: "Intake — spec", gate: null, kind: "intake" },
  { key: "validate", label: "Validation de spec", gate: "validate", kind: "auto" },
  { key: "critique", label: "Critique de spec", gate: "critique", kind: "auto" },
  { key: "feasibility", label: "Faisabilité & sizing", gate: "feasibility", kind: "manual" },
  { key: "design", label: "Conception de solution", gate: "design", kind: "manual" },
  { key: "budgets", label: "Budgets & acceptance", gate: "budgets", kind: "manual" },
  { key: "prereqs", label: "Pré-requis & provisioning", gate: "prereqs", kind: "manual" },
  { key: "plan", label: "Plan & approbation", gate: "plan", kind: "auto" },
]

export const PREREQ_ITEMS: { key: string; label: string }[] = [
  { key: "repo", label: "Repo / org GitHub prêt" },
  { key: "secrets", label: "Secrets & accès intégrations" },
  { key: "ai_budget", label: "Budget IA alloué" },
  { key: "compliance", label: "Conformité (GDPR / PCI) tranchée" },
  { key: "environments", label: "Environnements (dev / staging / prod)" },
]

export type Gates = Partial<Record<GateKey, boolean>>

export interface BlueprintDoc {
  id: string
  name: string
  mimeType: string
  size: number
  path?: string // bucket path when Storage is enabled
  dataUrl?: string // fallback when no bucket
}

export interface Blueprint {
  id: string
  title: string
  status: BlueprintStatus
  specYaml: string
  answers: string
  critique: SpecCritiqueResult | null
  plan: ScaffoldPlan | null
  feasibility: string
  designDoc: string
  acceptanceYaml: string
  prereqs: Record<string, boolean>
  gates: Gates
  documents: BlueprintDoc[]
  figmaUrl: string
  workspaceId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// --- Spec wizard form (shared by the UI and the AI extractor) ---------------
export interface SpecUseCase { name: string; actor: string; acceptance: string }
export interface SpecLatencyPath { path: string; p99: string }
export interface SpecConsistency { domain: string; level: "strong" | "eventual" }
export interface SpecEntity { name: string; accessPatterns: string; readWriteRatio: string; pii: boolean }
export interface SpecIntegration { name: string; slaMs: string; onFailure: string }

export interface SpecForm {
  name: string
  summary: string
  deployTarget: string
  stack: string
  useCases: SpecUseCase[]
  scale: string
  availabilitySlo: string
  errorBudget: string
  retention: string
  latencyPaths: SpecLatencyPath[]
  consistency: SpecConsistency[]
  compliance: string[]
  entities: SpecEntity[]
  integrations: SpecIntegration[]
  coverageTarget: string
  loadTestTarget: string
  qualityGates: string
}

export const EMPTY_SPEC_FORM: SpecForm = {
  name: "",
  summary: "",
  deployTarget: "",
  stack: "",
  useCases: [{ name: "", actor: "", acceptance: "" }],
  scale: "",
  availabilitySlo: "",
  errorBudget: "",
  retention: "",
  latencyPaths: [{ path: "", p99: "" }],
  consistency: [{ domain: "", level: "strong" }],
  compliance: [],
  entities: [{ name: "", accessPatterns: "", readWriteRatio: "", pii: false }],
  integrations: [{ name: "", slaMs: "", onFailure: "" }],
  coverageTarget: "",
  loadTestTarget: "",
  qualityGates: "",
}

// AI-proposed spec revision (the critique proposes changes; the human edits &
// approves). `revised_spec` is a full project.spec.yaml the user can modify.
export interface SpecChange { title: string; detail: string; spec_path: string }
export interface SpecRevision { revised_spec: string; changes: SpecChange[]; notes: string }

export function prereqsGate(prereqs: Record<string, boolean>): boolean {
  return PREREQ_ITEMS.every((p) => prereqs[p.key] === true)
}

export function canApprove(bp: Blueprint): boolean {
  return ALL_GATES.every((g) => bp.gates[g] === true)
}

export function pendingGates(bp: Blueprint): GateKey[] {
  return ALL_GATES.filter((g) => bp.gates[g] !== true)
}
