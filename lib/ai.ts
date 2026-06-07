// AI layer (spec §09). Real Claude API only — NO heuristic/mock fallback.
// If ANTHROPIC_API_KEY is missing or a call fails, callers get a thrown error
// (surfaced as 503) instead of a simulated response.

import Anthropic from "@anthropic-ai/sdk"

import { currentApiKey, recordAiUsage } from "./ai-usage"

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
  const res = await client.messages.create(params)
  await recordAiUsage(params.model as string, res.usage)
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
