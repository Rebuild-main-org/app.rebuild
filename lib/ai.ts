// AI layer (spec §09). Real Claude API only — NO heuristic/mock fallback.
// If ANTHROPIC_API_KEY is missing or a call fails, callers get a thrown error
// (surfaced as 503) instead of a simulated response.

import Anthropic from "@anthropic-ai/sdk"

import { currentApiKey, recordAiUsage } from "./ai-usage"
import { getAiModel } from "./settings"
import { loadSystemPrompt } from "./doc-loader"
import type { SpecForm, SpecRevision } from "./blueprint-types"

// Compile-time default. The *effective* model is resolved per call in
// trackedCreate() from the runtime setting a SUPER_ADMIN controls (see
// lib/settings.ts) — changing it there applies to everyone. The per-feature
// `model: MODEL` below are just type-required placeholders; trackedCreate
// overrides them with the active model.
const MODEL = process.env.AI_MODEL ?? "claude-opus-4-8"

export class AINotConfiguredError extends Error {
  constructor() {
    super("AI not configured — set ANTHROPIC_API_KEY")
    this.name = "AINotConfiguredError"
  }
}

let client: Anthropic | null = null
export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AINotConfiguredError()
  if (!client) client = new Anthropic()
  return client
}

// Every model call goes through here so usage/cost is logged for governance.
async function trackedCreate(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming
): Promise<Anthropic.Messages.Message> {
  // Use the caller's connected Anthropic key if any (« Connect with Claude »),
  // else the shared server client.
  const key = currentApiKey()
  const client = key ? new Anthropic({ apiKey: key }) : getClient()
  // The active model is a runtime setting a SUPER_ADMIN can change for everyone.
  const model = await getAiModel()
  const res = await client.messages.create({ ...params, model })
  await recordAiUsage(model, res.usage)
  return res
}

// Cache-friendly system prompt block (prompt caching).
function systemBlocks(text: string) {
  return [
    { type: "text" as const, text, cache_control: { type: "ephemeral" as const } },
  ]
}

async function completeText(system: string, user: string, maxTokens = 1024) {
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system: systemBlocks(system),
    messages: [{ role: "user", content: user }],
  })
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
}

// --- Code review -------------------------------------------------------------

export type ReviewScore = "A" | "B" | "C" | "D"
export interface ReviewFinding {
  severity: "info" | "warning" | "critical"
  title: string
  detail: string
}
export interface CodeReview {
  score: ReviewScore
  summary: string
  findings: ReviewFinding[]
}

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "string", enum: ["A", "B", "C", "D"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          title: { type: "string" },
          detail: { type: "string" },
        },
        required: ["severity", "title", "detail"],
      },
    },
  },
  required: ["score", "summary", "findings"],
} as const

// Validates the model's structured output server-side before returning it.
function parseReview(text: string): CodeReview {
  const raw = JSON.parse(text) as unknown
  if (typeof raw !== "object" || raw === null) throw new Error("Invalid AI review payload")
  const r = raw as Record<string, unknown>
  const scores: ReviewScore[] = ["A", "B", "C", "D"]
  const sevs = ["info", "warning", "critical"]
  if (!scores.includes(r.score as ReviewScore)) throw new Error("Invalid review score")
  if (typeof r.summary !== "string") throw new Error("Invalid review summary")
  if (!Array.isArray(r.findings)) throw new Error("Invalid review findings")
  const findings: ReviewFinding[] = r.findings.map((f) => {
    const o = f as Record<string, unknown>
    if (!sevs.includes(o.severity as string) || typeof o.title !== "string" || typeof o.detail !== "string") {
      throw new Error("Invalid review finding")
    }
    return { severity: o.severity as ReviewFinding["severity"], title: o.title, detail: o.detail }
  })
  return { score: r.score as ReviewScore, summary: r.summary, findings }
}

export async function codeReview(input: {
  title: string
  diff: string
  ticket?: string
}): Promise<CodeReview> {
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      "You are a senior engineer doing a non-blocking PR review. Flag potential bugs, security issues, convention violations, and improvements. Be concise and specific. Grade overall quality A (excellent) to D (needs work)."
    ),
    messages: [
      {
        role: "user",
        content: `PR: ${input.title}${input.ticket ? ` (ticket ${input.ticket})` : ""}\n\nDiff/code:\n${input.diff}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema: REVIEW_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  return parseReview(text)
}

// --- Documentation -----------------------------------------------------------

export async function generateDocs(input: { path: string; code: string }): Promise<string> {
  return completeText(
    "You generate clear technical documentation. Produce concise Markdown: a one-line summary, key responsibilities, and JSDoc/docstring suggestions for exported symbols. No preamble.",
    `File: ${input.path}\n\n${input.code}`,
    1500
  )
}

// --- Contextual chat (Copilot) ----------------------------------------------

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

export async function chat(input: {
  context: string
  history: ChatTurn[]
  message: string
}): Promise<string> {
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      `You are the in-app Copilot for REBUILD Engineering OS — a platform for managing software projects (workspaces, projects, tickets, IDE, git). Help engineers and leads with the current context. Be concise and actionable.\n\nCurrent context:\n${input.context}`
    ),
    messages: [
      ...input.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: input.message },
    ],
  })
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim()
}

// --- AI triage (FUTURE) ------------------------------------------------------

export interface TriageSuggestion {
  type: "TASK" | "BUG" | "FEATURE" | "SPIKE"
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  suggestedAssigneeId: string | null
  reason: string
}

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["TASK", "BUG", "FEATURE", "SPIKE"] },
    priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
    suggestedAssigneeId: { type: ["string", "null"] },
    reason: { type: "string" },
  },
  required: ["type", "priority", "suggestedAssigneeId", "reason"],
} as const

export async function triageTicket(input: {
  title: string
  description: string
  candidates: { id: string; name: string; role: string; openLoad: number }[]
}): Promise<TriageSuggestion> {
  const roster = input.candidates
    .map((c) => `- ${c.id} \u00b7 ${c.name} (${c.role}), ${c.openLoad} open tickets`)
    .join("\n")
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      "You triage incoming engineering tickets. Choose the type and priority, and suggest the best assignee id from the roster (prefer matching skill/role and lower load). If none fit, return null. Justify in one sentence."
    ),
    messages: [
      {
        role: "user",
        content: `Title: ${input.title}\nDescription: ${input.description}\n\nRoster:\n${roster || "(none)"}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  return JSON.parse(text) as TriageSuggestion
}

// --- AI quote from a CRM lead (FUTURE) ---------------------------------------

export interface QuoteDraft {
  items: { description: string; quantity: number; unitPrice: number }[]
  notes: string
}

const QUOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice"],
      },
    },
    notes: { type: "string" },
  },
  required: ["items", "notes"],
} as const

export async function quoteFromLead(input: {
  company: string
  notes: string
  targetValue: number
  currency: string
}): Promise<QuoteDraft> {
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      `You are a pre-sales engineer drafting a software services quote. Break the engagement into 3-6 realistic line items (discovery, design, build, QA, deployment) with quantities and unit prices in ${input.currency}. Aim the total near the target value. Keep notes to payment terms + assumptions.`
    ),
    messages: [
      {
        role: "user",
        content: `Client: ${input.company}\nTarget budget: ${input.targetValue} ${input.currency}\nContext/notes: ${input.notes || "(none)"}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema: QUOTE_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  return JSON.parse(text) as QuoteDraft
}

// --- Standup digest + changelog (FUTURE) -------------------------------------

export async function standupDigest(content: string): Promise<string> {
  return completeText(
    "You write a concise daily standup for an engineering workspace. Three short sections: Shipped, In progress, Blockers/at-risk. Bullet points, no fluff.",
    content,
    800
  )
}

export async function changelogFromPRs(content: string): Promise<string> {
  return completeText(
    "You write release notes from merged pull requests. Group into Features, Fixes, and Chores. One concise bullet per change, user-facing language. Markdown only, no preamble.",
    content,
    1200
  )
}

// --- Summaries ---------------------------------------------------------------

export async function summarize(input: {
  kind: "project" | "sprint" | "ticket"
  content: string
}): Promise<string> {
  return completeText(
    `You summarise ${input.kind} status for a busy reader in plain language. 3-5 sentences, no jargon, highlight what's done, in progress, and at risk.`,
    input.content,
    800
  )
}


// --- Scaffold projects + tickets from an architecture doc (FUTURE) ----------

export interface ScaffoldTicket {
  ref: string // stable temporary id for cross-linking within this plan
  title: string
  description: string
  type: "TASK" | "BUG" | "FEATURE" | "SPIKE" | "EPIC"
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  points: number | null
  subtasks: string[] // titles of child sub-tasks
  links: { to: string; type: "BLOCKS" | "RELATES" | "DUPLICATES" }[] // to = another ticket's ref
}

export interface ScaffoldPlan {
  projects: {
    name: string
    shortCode: string
    description: string
    tickets: ScaffoldTicket[]
  }[]
}

const SCAFFOLD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          shortCode: { type: "string", description: "2-5 uppercase letters, e.g. WEB" },
          description: { type: "string" },
          tickets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                ref: { type: "string", description: "unique stable id within the plan, e.g. WEB-1" },
                title: { type: "string" },
                description: { type: "string" },
                type: { type: "string", enum: ["TASK", "BUG", "FEATURE", "SPIKE", "EPIC"] },
                priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
                points: { type: ["number", "null"] },
                subtasks: {
                  type: "array",
                  items: { type: "string" },
                  description: "concrete child sub-task titles that break this ticket down",
                },
                links: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      to: { type: "string", description: "ref of another ticket in this plan" },
                      type: { type: "string", enum: ["BLOCKS", "RELATES", "DUPLICATES"] },
                    },
                    required: ["to", "type"],
                  },
                },
              },
              required: ["ref", "title", "description", "type", "priority", "points", "subtasks", "links"],
            },
          },
        },
        required: ["name", "shortCode", "description", "tickets"],
      },
    },
  },
  required: ["projects"],
} as const

// Reads an architecture / spec document and proposes a delivery plan: one or
// several projects, each broken into tickets with sub-tasks and dependency links.
export async function planFromArchitecture(content: string): Promise<ScaffoldPlan> {
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      "You are a tech lead turning an architecture document into an executable plan. Identify the distinct deliverable areas and model each as a PROJECT (only split into several when the doc clearly spans separate components/services; otherwise one project). For each project, write a concise backlog of TICKETS covering setup, core features, integrations, testing and deployment. " +
        "For EACH ticket: (1) give it a unique `ref` (e.g. WEB-1); (2) break it into 2-5 concrete `subtasks` (titles); (3) declare `links` to other tickets it depends on, using their `ref` and a type (BLOCKS = this must be done before the target, RELATES, DUPLICATES). Reference foundational tickets (setup/infra) as BLOCKS dependencies of feature tickets where logical. Use realistic types/priorities and story points (1,2,3,5,8,13) or null. shortCode is 2-5 uppercase letters."
    ),
    messages: [{ role: "user", content: `Architecture document:\n\n${content.slice(0, 40000)}` }],
    output_config: { format: { type: "json_schema", schema: SCAFFOLD_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("")
  return JSON.parse(text) as ScaffoldPlan
}

// --- Spec critique (pre-build quality gate, step 3) --------------------------
// Adversarial review of a project.spec.yaml. Source of truth for the prompt is
// prompts/spec-critique.md (+ prompts/_schemas/spec-critique.schema.json). The
// prompt is loaded from disk when available (loadSystemPrompt) and falls back to
// the inline copy below, because prompt files aren't bundled in the serverless
// build. readiness=READY iff no BLOCKER finding and no unanswered blocking question.

export type SpecCritiqueCategory =
  | "completeness"
  | "consistency"
  | "realism"
  | "data_access"
  | "integrations"
  | "security_compliance"
  | "testability"
  | "ambiguity"
export type SpecCritiqueSeverity = "BLOCKER" | "MAJOR" | "MINOR" | "INFO"

export interface SpecCritiqueFinding {
  id: string
  category: SpecCritiqueCategory
  severity: SpecCritiqueSeverity
  spec_path: string
  problem: string
  why_it_matters: string
  suggested_resolution: string
  requires_human: boolean
}
export interface SpecCritiqueQuestion {
  id: string
  question: string
  why_needed: string
  blocking: boolean
  proposed_default: string | null
}
export interface SpecCritiqueAssumption {
  id: string
  assumption: string
  impact_if_wrong: string
}
export interface SpecCritiqueResult {
  readiness: "READY" | "BLOCK"
  spec_quality_score: number
  summary: string
  findings: SpecCritiqueFinding[]
  open_questions: SpecCritiqueQuestion[]
  assumptions_to_confirm: SpecCritiqueAssumption[]
  resolved: string[]
  next_action: string
}

const SPEC_CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    readiness: { type: "string", enum: ["READY", "BLOCK"] },
    spec_quality_score: { type: "integer", description: "0-100" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          category: {
            type: "string",
            enum: [
              "completeness",
              "consistency",
              "realism",
              "data_access",
              "integrations",
              "security_compliance",
              "testability",
              "ambiguity",
            ],
          },
          severity: { type: "string", enum: ["BLOCKER", "MAJOR", "MINOR", "INFO"] },
          spec_path: { type: "string" },
          problem: { type: "string" },
          why_it_matters: { type: "string" },
          suggested_resolution: { type: "string" },
          requires_human: { type: "boolean" },
        },
        required: [
          "id",
          "category",
          "severity",
          "spec_path",
          "problem",
          "why_it_matters",
          "suggested_resolution",
          "requires_human",
        ],
      },
    },
    open_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          why_needed: { type: "string" },
          blocking: { type: "boolean" },
          proposed_default: { type: ["string", "null"] },
        },
        required: ["id", "question", "why_needed", "blocking", "proposed_default"],
      },
    },
    assumptions_to_confirm: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          assumption: { type: "string" },
          impact_if_wrong: { type: "string" },
        },
        required: ["id", "assumption", "impact_if_wrong"],
      },
    },
    resolved: { type: "array", items: { type: "string" } },
    next_action: { type: "string" },
  },
  required: [
    "readiness",
    "spec_quality_score",
    "summary",
    "findings",
    "open_questions",
    "assumptions_to_confirm",
    "resolved",
    "next_action",
  ],
} as const

// Inline fallback of prompts/spec-critique.md (body after the <!-- SYSTEM -->
// marker), verbatim. Used when the prompt file isn't readable at runtime (the
// serverless bundle doesn't ship prompts/), so production runs the full prompt.
// Keep in sync with prompts/spec-critique.md. Template vars: {{spec_yaml}}
// {{answers}} {{output_language}}.
const SPEC_CRITIQUE_SYSTEM = `You are a **staff-level software architect** acting as an adversarial-but-constructive reviewer of a project specification (\`project.spec.yaml\`). Your job is to decide whether the spec is **complete, internally consistent, realistic, and unambiguous enough to build a production-grade system from** — and, if not, to BLOCK and surface exactly what must be resolved.

You are the quality gate that runs BEFORE any workspace is created or any code is written. A spec that passes you is handed to an autonomous agent that builds the system **literally**; therefore every gap you miss becomes a defect the agent ships, and "more compute" will not fix a bad spec.

## Operating principles
- **Never silently fill gaps.** If something required is missing or vague, you FLAG it — you do not invent it. You may *propose* a default, but only as an explicit assumption the human must confirm.
- **Be specific.** Every finding points to a path in the spec (e.g. \`nfr.latency_budgets_ms[0]\`, \`data.entities[trip].access_patterns\`, \`integrations[stripe]\`) and states the concrete problem, why it matters in production, and a suggested resolution.
- **Attack the spec, not the wording.** Hunt contradictions, unrealistic targets, unhandled failure modes, untestable invariants — never style.
- **Gate on blockers.** Output \`BLOCK\` while any blocking gap or unanswered blocking question remains; only a spec with none is \`READY\`.
- **Lead with consequence.** Order findings by how much they would damage performance, correctness, or scalability.

## Review rubric — check EVERY dimension
**A. completeness** — each bounded context has aggregates with states + invariants; every use case has *measurable* acceptance criteria (reject "fast", "reliable", "scalable" with no numbers); NFR block present (scale, latency budget per critical path, availability SLO + error budget, consistency per data domain, retention, compliance); every read/written entity has \`access_patterns\` + \`read_write_ratio\`; every integration has \`sla_ms\` + \`on_failure\`; stack + deploy target set; \`quality_gates\` set.
**B. consistency** — latency budgets vs declared scale & consistency (a strong-consistency write with sub-50 ms p99 at high RPS is suspect); invariants vs consistency choices (e.g. "exactly one active driver" while the matching path is \`eventual\`); state machine has no unreachable or dead-end states besides terminal ones; access patterns vs the keys/indexes they imply.
**C. realism / feasibility** — are the budgets achievable on the declared stack? (cross-region strong consistency at low p99; 10B rows + high write RPS on a single Postgres with no partitioning/replicas; etc.). Flag capacity & cost tension.
**D. data_access** — each access pattern must map to a concrete index/strategy; flag unindexed *hot* patterns, missing pagination on lists, implied N+1, full-table scans; \`hot: true\` + very large ⇒ partitioning/sharding/caching required; PII fields ⇒ encryption + retention + erasure.
**E. integrations** — every external call needs timeout + retry + idempotency + degradation/fallback + circuit breaker; flag any critical-path call whose \`on_failure\` BLOCKS the user flow; webhooks need idempotency/dedup.
**F. security_compliance** — PII present but GDPR absent ⇒ BLOCKER; payments present but PCI-DSS absent ⇒ BLOCKER; check the implied authz model, secrets handling, data residency.
**G. testability** — acceptance criteria must be testable; an SLO implies required metrics/alerts; the load-test target must match declared scale.
**H. ambiguity** — invariants must be precise, testable predicates; no undefined domain terms; the glossary must cover them.

## Severity & gating
- \`BLOCKER\` — a correct/production-grade system cannot be built until resolved. Forces \`BLOCK\`.
- \`MAJOR\` — strongly degrades quality; resolve before build.
- \`MINOR\` / \`INFO\` — improvement or note.
- \`readiness = READY\` **iff** zero \`BLOCKER\` findings AND zero unanswered \`blocking\` questions. Otherwise \`BLOCK\`.

## Clarification loop
\`{{answers}}\` holds the human's prior resolutions (empty on the first pass). On each run: incorporate the answers, list the ids they resolve in \`resolved\`, re-evaluate the WHOLE spec (an answer may create a new contradiction), and surface only what remains open. Converge toward zero blocking items.

## Output
Respond with **JSON only** — no prose, no markdown, no code fences — matching \`spec-critique.schema.json\`. Write every human-facing field (\`problem\`, \`why_it_matters\`, \`suggested_resolution\`, \`question\`, \`assumption\`, \`summary\`, \`next_action\`) in **{{output_language}}** (default: French). Keep keys and enum values in English.

## Example findings (style & severity anchor)
- \`BLOCKER · security_compliance · nfr.data\` — problem: "PII déclaré (\`pii: true\`) mais \`compliance\` n'inclut pas GDPR." why: "Sans base légale ni droit à l'effacement, le système est non conforme et non livrable en UE." resolution: "Ajouter \`GDPR\` à \`compliance\`, déclarer la rétention et le flux d'effacement." requires_human: true.
- \`BLOCKER · data_access · data.entities[trip].access_patterns\` — problem: "Pattern \`par driver_id où status=ENROUTE\` sur une table \`hot: true\` à 10B lignes, sans partitionnement déclaré." why: "Un simple index ne tiendra pas le budget p99 200 ms à 5000 rps ; latence et coût croissent sans borne." resolution: "Déclarer un partitionnement (par date ou region) + index partiel ; confirmer le datastore." requires_human: true.
- \`MAJOR · consistency · nfr.latency_budgets_ms[0]\` — problem: "Budget p99 300 ms sur \`POST /trips\` alors que la course enchaîne un write paiement strong + un appel maps (\`sla_ms: 300\`)." why: "Le budget est inférieur à la somme des dépendances synchrones." resolution: "Sortir paiement/maps du chemin synchrone (queue + ETA en cache) ou relever le budget." requires_human: true.

Spec to review:
\`\`\`yaml
{{spec_yaml}}
\`\`\`

Previous human resolutions (may be empty):
\`\`\`
{{answers}}
\`\`\``

// Adversarial pre-build review of a project.spec.yaml. `answers` carries the
// human's resolutions from previous rounds (empty on the first pass).
export async function critiqueSpec(input: {
  spec: string
  answers?: string
  outputLanguage?: string
}): Promise<SpecCritiqueResult> {
  const lang = input.outputLanguage ?? "fr"
  const template = loadSystemPrompt("spec-critique") ?? SPEC_CRITIQUE_SYSTEM
  const system = template
    .split("{{spec_yaml}}").join(input.spec)
    .split("{{answers}}").join(input.answers ?? "")
    .split("{{output_language}}").join(lang)
  const res = await trackedCreate({
    model: MODEL,
    // Generous budget: adaptive thinking also draws from max_tokens, and the
    // critique JSON (many findings/questions) must complete or it truncates.
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    system: systemBlocks(system),
    messages: [
      { role: "user", content: "Audit the spec embedded above and respond with JSON only matching the schema." },
    ],
    output_config: { format: { type: "json_schema", schema: SPEC_CRITIQUE_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim()
  try {
    return JSON.parse(text) as SpecCritiqueResult
  } catch {
    throw new Error("Réponse IA tronquée — réessaie (la spec est peut-être très longue).")
  }
}

// --- Spec form extraction (fill the guided wizard from a markdown doc) -------
// Reads a free-form architecture/brief markdown and extracts the structured
// fields of the intake wizard. Never invents NFR numbers — leaves fields empty
// when the document doesn't state them.
const SPEC_FORM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    deployTarget: { type: "string" },
    stack: { type: "string", description: "comma- or newline-separated tech list" },
    useCases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          actor: { type: "string" },
          acceptance: { type: "string" },
        },
        required: ["name", "actor", "acceptance"],
      },
    },
    scale: { type: "string" },
    availabilitySlo: { type: "string" },
    errorBudget: { type: "string" },
    retention: { type: "string" },
    latencyPaths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { path: { type: "string" }, p99: { type: "string" } },
        required: ["path", "p99"],
      },
    },
    consistency: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { domain: { type: "string" }, level: { type: "string", enum: ["strong", "eventual"] } },
        required: ["domain", "level"],
      },
    },
    compliance: { type: "array", items: { type: "string" } },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          accessPatterns: { type: "string", description: "one pattern per line" },
          readWriteRatio: { type: "string" },
          pii: { type: "boolean" },
        },
        required: ["name", "accessPatterns", "readWriteRatio", "pii"],
      },
    },
    integrations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, slaMs: { type: "string" }, onFailure: { type: "string" } },
        required: ["name", "slaMs", "onFailure"],
      },
    },
    coverageTarget: { type: "string" },
    loadTestTarget: { type: "string" },
    qualityGates: { type: "string", description: "one gate per line" },
  },
  required: [
    "name", "summary", "deployTarget", "stack", "useCases", "scale", "availabilitySlo",
    "errorBudget", "retention", "latencyPaths", "consistency", "compliance", "entities",
    "integrations", "coverageTarget", "loadTestTarget", "qualityGates",
  ],
} as const

// --- Spec revision proposal (critique proposes edits; human approves) -------
// Given a spec + its critique + the human's answers, produce a REVISED full
// project.spec.yaml that resolves the auto-fixable findings and applies the
// answers. Gaps with no known value get a clearly-marked assumption (inline
// `# assumption:` comment) — never a silently invented hard NFR number.
const SPEC_REVISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    revised_spec: { type: "string", description: "the full revised project.spec.yaml" },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          spec_path: { type: "string" },
        },
        required: ["title", "detail", "spec_path"],
      },
    },
    notes: { type: "string" },
  },
  required: ["revised_spec", "changes", "notes"],
} as const

export async function proposeSpecRevision(input: {
  spec: string
  critique?: unknown
  answers?: string
  outputLanguage?: string
}): Promise<SpecRevision> {
  const lang = input.outputLanguage ?? "fr"
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      "You are a staff software architect. Given a project.spec.yaml, its critique findings and the human's answers, produce a REVISED full project.spec.yaml that resolves the auto-fixable findings and applies the answers. " +
        "Where a value is genuinely unknown, propose a sensible DEFAULT and mark it inline as `# assumption: …` — NEVER silently invent hard NFR numbers (scale, latency, SLO) without flagging them as assumptions. Keep the YAML valid and keep everything the human already provided unless a finding requires changing it. " +
        `List each change you made (title, detail, spec_path). Write change titles/details and notes in ${lang}; keep YAML keys/values in their original language. Respond with JSON only.`
    ),
    messages: [
      {
        role: "user",
        content:
          `Current spec:\n\`\`\`yaml\n${input.spec.slice(0, 30000)}\n\`\`\`\n\n` +
          `Critique (JSON):\n${JSON.stringify(input.critique ?? {}).slice(0, 12000)}\n\n` +
          `Human answers:\n${input.answers || "(none)"}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema: SPEC_REVISION_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim()
  try {
    return JSON.parse(text) as SpecRevision
  } catch {
    throw new Error("Réponse IA tronquée — réessaie.")
  }
}

export async function extractSpecForm(content: string): Promise<SpecForm> {
  const res = await trackedCreate({
    model: MODEL,
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    system: systemBlocks(
      "You convert a free-form project brief / architecture document into the structured fields of an intake form. Extract only what the document states; leave a field as an empty string (or empty array) when it is not stated — NEVER invent NFR numbers, SLOs, latency budgets or scale figures. `stack` is comma/newline-separated. Each entity's `accessPatterns` and the `qualityGates` are newline-separated. `consistency.level` is 'strong' or 'eventual'. Set `pii: true` only when personal data is clearly involved."
    ),
    messages: [{ role: "user", content: `Document:\n\n${content.slice(0, 40000)}` }],
    output_config: { format: { type: "json_schema", schema: SPEC_FORM_SCHEMA } },
  })
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim()
  try {
    return JSON.parse(text) as SpecForm
  } catch {
    throw new Error("Réponse IA tronquée — réessaie avec un document plus court.")
  }
}
