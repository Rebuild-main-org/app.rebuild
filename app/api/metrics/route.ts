import { metricsText, metricsContentType } from "@/lib/observability/metrics"

export const dynamic = "force-dynamic"

// GET /api/metrics — Prometheus exposition for the AI layer (ai_calls_total,
// ai_cost_usd_total, ai_latency_seconds, ai_feedback_score/total + defaults).
// Guarded by METRICS_TOKEN (Bearer) when set; open otherwise (like /api/cron),
// so configure the token in production. Scraped by Prometheus → Grafana.
export async function GET(request: Request) {
  const token = process.env.METRICS_TOKEN
  if (token) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${token}`) {
      return new Response("Unauthorized", { status: 401 })
    }
  }
  const body = await metricsText()
  return new Response(body, { status: 200, headers: { "Content-Type": metricsContentType() } })
}
