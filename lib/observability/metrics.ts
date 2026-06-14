// Prometheus metrics for the AI layer (Ticket 3). In-process (prom-client), so
// it always works — the only external piece is the scrape endpoint /api/metrics.
// Recording is best-effort and wrapped: a metrics hiccup can never break an AI
// call. Like the rest of observability, all of this is emitted from the AI choke
// points (trackedCreate / the feedback route), not from feature code.
import "server-only"
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client"

// Survive Next.js dev hot-reload (module re-eval) — register once per process.
const g = globalThis as unknown as { __rebuildMetrics?: Metrics }

interface Metrics {
  registry: Registry
  calls: Counter<"feature" | "model" | "workspace" | "status">
  cost: Counter<"feature" | "model" | "workspace">
  latency: Histogram<"feature" | "model">
  feedbackScore: Gauge<"feature">
  feedbackTotal: Counter<"feature" | "score">
}

function build(): Metrics {
  const registry = new Registry()
  registry.setDefaultLabels({ app: "rebuild" })
  try {
    collectDefaultMetrics({ register: registry })
  } catch {
    /* default metrics are a bonus */
  }
  const calls = new Counter({
    name: "ai_calls_total",
    help: "AI model calls",
    labelNames: ["feature", "model", "workspace", "status"],
    registers: [registry],
  })
  const cost = new Counter({
    name: "ai_cost_usd_total",
    help: "AI spend in USD",
    labelNames: ["feature", "model", "workspace"],
    registers: [registry],
  })
  const latency = new Histogram({
    name: "ai_latency_seconds",
    help: "AI call latency (seconds)",
    labelNames: ["feature", "model"],
    buckets: [0.5, 1, 2, 5, 10, 20, 40, 80],
    registers: [registry],
  })
  const feedbackScore = new Gauge({
    name: "ai_feedback_score",
    help: "Last human feedback score per feature (-1..1)",
    labelNames: ["feature"],
    registers: [registry],
  })
  const feedbackTotal = new Counter({
    name: "ai_feedback_total",
    help: "Human feedback submissions",
    labelNames: ["feature", "score"],
    registers: [registry],
  })
  return { registry, calls, cost, latency, feedbackScore, feedbackTotal }
}

function metrics(): Metrics {
  if (!g.__rebuildMetrics) g.__rebuildMetrics = build()
  return g.__rebuildMetrics
}

// Record one model call (success or error). Never throws.
export function recordAiCall(o: {
  feature: string
  model: string
  workspace?: string
  status: "ok" | "error"
  costUsd?: number
  latencySec?: number
}): void {
  try {
    const m = metrics()
    const ws = o.workspace ?? "none"
    m.calls.inc({ feature: o.feature, model: o.model, workspace: ws, status: o.status })
    if (o.costUsd) m.cost.inc({ feature: o.feature, model: o.model, workspace: ws }, o.costUsd)
    if (o.latencySec != null) m.latency.observe({ feature: o.feature, model: o.model }, o.latencySec)
  } catch {
    /* best-effort */
  }
}

// Record one human feedback submission. Never throws.
export function recordFeedback(feature: string, score: number): void {
  try {
    const m = metrics()
    m.feedbackScore.set({ feature }, score)
    m.feedbackTotal.inc({ feature, score: String(score) })
  } catch {
    /* best-effort */
  }
}

// Prometheus exposition text for the scrape endpoint.
export async function metricsText(): Promise<string> {
  return metrics().registry.metrics()
}

export function metricsContentType(): string {
  return metrics().registry.contentType
}
