// AI governance: usage/cost logging, per-user budget caps, and admin summary.
import "server-only"
import { randomUUID } from "crypto"
import { AsyncLocalStorage } from "node:async_hooks"

import { sb, getUsersMap } from "./data"
import { isAdmin } from "./auth"
import { startTrace, flushObservability, type ObsTrace } from "./observability/langfuse"
import type { Role } from "./types"

// Price per 1M tokens (USD), input/output. Default to Opus pricing.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
}
function priceFor(model: string) {
  return PRICING[model] ?? PRICING[Object.keys(PRICING).find((k) => model.startsWith(k)) ?? ""] ?? { in: 5, out: 25 }
}
// Full per-call cost. `inTok` (Anthropic's input_tokens) already EXCLUDES cached
// tokens — cache reads/writes are billed separately: a cache read ≈ 0.1x the
// input rate, a cache write (5m TTL) ≈ 1.25x. Counting them is what makes the
// caching savings show up correctly instead of being invisible.
export function costUsd(
  model: string,
  inTok: number,
  outTok: number,
  cacheReadTok = 0,
  cacheCreateTok = 0
): number {
  const p = priceFor(model)
  return (
    (inTok / 1e6) * p.in +
    (cacheReadTok / 1e6) * p.in * 0.1 +
    (cacheCreateTok / 1e6) * p.in * 1.25 +
    (outTok / 1e6) * p.out
  )
}

// Default per-user monthly cap (USD). Admins/super-admins are exempt.
export function aiMonthlyBudget(): number {
  const n = Number(process.env.AI_MONTHLY_BUDGET_USD)
  return Number.isFinite(n) && n > 0 ? n : 25
}

// Per-call attribution carried via async context (set by routes via withAi).
interface AiCtx {
  userId?: string
  feature?: string
  workspaceId?: string
  projectId?: string
  apiKey?: string // the caller's own Anthropic key (« Connect with Claude »)
  traceId?: string // stable id for this AI action — returned to the UI for feedback
  trace?: ObsTrace // Langfuse trace (a no-op stub when observability is disabled)
}
const store = new AsyncLocalStorage<AiCtx>()

// The Anthropic API key to use for the current AI call: the user's connected
// key when present, else undefined (callers fall back to the server key).
export function currentApiKey(): string | undefined {
  return store.getStore()?.apiKey
}

// The observability trace for the current AI action (trackedCreate adds a
// generation under it). Undefined outside a withAi scope.
export function currentTrace(): ObsTrace | undefined {
  return store.getStore()?.trace
}

// The stable trace id for the current AI action — routes read this AFTER the AI
// call resolves and return it to the client so feedback can attach to it. Exists
// whether or not Langfuse is enabled.
export function currentTraceId(): string | undefined {
  return store.getStore()?.traceId
}

// A user's connected Anthropic key (« Connect with Claude »), or undefined.
export async function userAnthropicKey(userId: string): Promise<string | undefined> {
  try {
    const { data } = await sb().from("user_ai_keys").select("anthropic_key").eq("user_id", userId).maybeSingle()
    const k = (data?.anthropic_key as string) ?? ""
    return k || undefined
  } catch {
    return undefined
  }
}

// Record one model call (best-effort). Reads the active context for attribution.
export async function recordAiUsage(
  model: string,
  usage:
    | {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number | null
        cache_creation_input_tokens?: number | null
      }
    | null
    | undefined
): Promise<void> {
  const ctx = store.getStore() ?? {}
  const inTok = usage?.input_tokens ?? 0
  const outTok = usage?.output_tokens ?? 0
  const cacheRead = usage?.cache_read_input_tokens ?? 0
  const cacheCreate = usage?.cache_creation_input_tokens ?? 0
  const base = {
    id: randomUUID(),
    user_id: ctx.userId ?? null,
    workspace_id: ctx.workspaceId ?? null,
    project_id: ctx.projectId ?? null,
    feature: ctx.feature ?? "chat",
    model,
    input_tokens: inTok,
    output_tokens: outTok,
    cost_usd: Number(costUsd(model, inTok, outTok, cacheRead, cacheCreate).toFixed(6)),
    created_at: new Date().toISOString(),
  }
  try {
    // Capture cache tokens so cache effectiveness is measurable. The columns ship
    // in supabase/ai-usage.sql; if the migration hasn't run yet the insert with
    // the extra columns errors, so we retry without them — governance logging
    // keeps working either way (best-effort).
    const { error } = await sb()
      .from("ai_usage")
      .insert({ ...base, cache_read_tokens: cacheRead, cache_creation_tokens: cacheCreate })
    if (error) await sb().from("ai_usage").insert(base)
  } catch {
    /* governance logging is best-effort */
  }
}

// Spend (USD) for a user since `sinceMs`.
export async function aiSpendSince(userId: string, sinceMs: number): Promise<number> {
  const { data } = await sb()
    .from("ai_usage")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", new Date(sinceMs).toISOString())
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
}

// This-month AI cost/tokens for a single workspace (for the workspace overview).
export async function workspaceAiSpend(
  workspaceId: string
): Promise<{ costUsd: number; tokens: number; calls: number }> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data } = await sb()
    .from("ai_usage")
    .select("cost_usd,input_tokens,output_tokens")
    .eq("workspace_id", workspaceId)
    .gte("created_at", monthStart.toISOString())
  const rows = data ?? []
  return {
    costUsd: rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
    tokens: rows.reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0),
    calls: rows.length,
  }
}

export class AiBudgetError extends Error {
  spent: number
  cap: number
  constructor(spent: number, cap: number) {
    super(`AI monthly budget exceeded: $${spent.toFixed(2)} of $${cap.toFixed(2)}. Try again next month or ask an admin to raise it.`)
    this.name = "AiBudgetError"
    this.spent = spent
    this.cap = cap
  }
}

// Run `fn` attributed to a user+feature, enforcing the monthly budget first
// (admins/super-admins are exempt). Throws AiBudgetError when over.
export async function withAi<T>(
  user: { id: string; role: Role },
  feature: string,
  fn: () => Promise<T>,
  // `traceRef` is an optional out-param: withAi sets `traceRef.id` to the trace
  // id synchronously, so a route can read it AFTER withAi resolves (the ALS
  // store is only live during the callback). Non-breaking — existing callers
  // pass nothing.
  scope: { workspaceId?: string; projectId?: string; traceRef?: { id?: string } } = {}
): Promise<T> {
  // The user's own connected Anthropic key (« Connect with Claude »). When set,
  // their calls run on their account — so they're exempt from the server budget.
  const apiKey = await userAnthropicKey(user.id)
  if (!apiKey && !isAdmin(user.role)) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const spent = await aiSpendSince(user.id, monthStart.getTime())
    const cap = aiMonthlyBudget()
    if (spent >= cap) throw new AiBudgetError(spent, cap)
  }
  // One trace per user-facing AI action. The id is generated here (not by the
  // SDK) so it exists even when Langfuse is off and can be returned to the UI.
  const traceId = randomUUID()
  if (scope.traceRef) scope.traceRef.id = traceId
  const trace = startTrace({
    id: traceId,
    name: feature,
    userId: user.id,
    metadata: { workspaceId: scope.workspaceId, projectId: scope.projectId },
    tags: [feature],
  })
  return store.run(
    { userId: user.id, feature, workspaceId: scope.workspaceId, projectId: scope.projectId, apiKey, traceId, trace },
    async () => {
      try {
        return await fn()
      } finally {
        // Flush is best-effort and never blocks/breaks the AI result.
        void flushObservability()
      }
    }
  )
}

// Admin dashboard: this-month totals + top spenders.
export interface AiUsageSummary {
  monthCostUsd: number
  monthCalls: number
  monthTokens: number
  cap: number
  topUsers: { userId: string; name: string; costUsd: number; calls: number; tokens: number }[]
  byFeature: { feature: string; costUsd: number; calls: number; tokens: number }[]
  byWorkspace: { workspaceId: string; name: string; costUsd: number; calls: number; tokens: number }[]
}
export async function aiUsageSummary(): Promise<AiUsageSummary> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data } = await sb()
    .from("ai_usage")
    .select("user_id,workspace_id,feature,cost_usd,input_tokens,output_tokens")
    .gte("created_at", monthStart.toISOString())
  const rows = data ?? []
  const users = await getUsersMap()
  const { data: wsRows } = await sb().from("workspaces").select("id,name")
  const wsName = new Map((wsRows ?? []).map((w) => [w.id as string, w.name as string]))

  type Agg = { cost: number; calls: number; tokens: number }
  const add = (m: Map<string, Agg>, k: string, cost: number, tokens: number) => {
    const a = m.get(k) ?? { cost: 0, calls: 0, tokens: 0 }
    a.cost += cost
    a.calls += 1
    a.tokens += tokens
    m.set(k, a)
  }
  const perUser = new Map<string, Agg>()
  const perFeat = new Map<string, Agg>()
  const perWs = new Map<string, Agg>()
  let monthCostUsd = 0
  let monthTokens = 0
  for (const r of rows) {
    const cost = Number(r.cost_usd ?? 0)
    const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0)
    monthCostUsd += cost
    monthTokens += tokens
    add(perUser, (r.user_id as string) ?? "system", cost, tokens)
    add(perFeat, (r.feature as string) ?? "chat", cost, tokens)
    add(perWs, (r.workspace_id as string) ?? "none", cost, tokens)
  }
  const top = <T,>(m: Map<string, Agg>, label: (k: string) => T) =>
    [...m.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => ({ ...label(k), costUsd: v.cost, calls: v.calls, tokens: v.tokens }))

  return {
    monthCostUsd,
    monthCalls: rows.length,
    monthTokens,
    cap: aiMonthlyBudget(),
    topUsers: top(perUser, (userId) => ({
      userId,
      name: users.get(userId)?.name ?? (userId === "system" ? "System / unattributed" : userId.slice(0, 8)),
    })).slice(0, 8),
    byFeature: top(perFeat, (feature) => ({ feature })),
    byWorkspace: top(perWs, (workspaceId) => ({
      workspaceId,
      name: workspaceId === "none" ? "Unattributed" : wsName.get(workspaceId) ?? workspaceId.slice(0, 8),
    })).slice(0, 10),
  }
}
