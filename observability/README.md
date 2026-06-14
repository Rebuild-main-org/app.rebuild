# Observability & continuous-improvement

LLM observability for REBUILD Engineering OS. **Optional and fail-safe**: with no
`LANGFUSE_*` env vars set, the whole layer is a transparent no-op — the AI
features behave byte-for-byte as without it (same doctrine as Slack/Stripe/Vercel
integrations). Nothing here changes AI behavior; it only observes.

> **Best practices** follow the official [Langfuse skill](https://github.com/langfuse/skills)
> (`.claude/skills/langfuse`): descriptive trace/generation names, model + token
> usage on every generation (auto-cost), nested spans, PII masked (off by
> default), `flush()` after each action, `user_id` + `feature` tags, `session_id`
> on the multi-turn copilot, and feedback as a `user-thumbs` score with an
> explicit `dataType`.

## Architecture

All instrumentation lives in the **two existing AI choke points** — never in
feature code:

| Layer | Choke point | What it records |
|---|---|---|
| One user-facing AI action | `withAi()` — `lib/ai-usage.ts` | opens a Langfuse **trace** (feature, userId, workspaceId, projectId); flushes after |
| One Claude API call | `trackedCreate()` — `lib/ai.ts` | a **generation** under the trace (model, tokens, computed cost, latency, prompt-version hash, optional redacted IO) |
| One MCP tool call (agent run) | `cli/mcp-rebuild.mjs` dispatch | a **span** nested under the run's trace via `LANGFUSE_TRACE_ID` |

The SDK is touched in exactly one file — `lib/observability/langfuse.ts` —
which exposes a small stable interface (`startTrace`, `scoreTrace`,
`flushObservability`) and returns a no-op stub when disabled.

A stable `traceId` is generated in `withAi` **regardless** of whether Langfuse is
enabled, and returned to the UI (`currentTraceId()`), so human feedback (a later
PR) can attach to it even with tracing off.

## Setup (Langfuse Cloud — recommended)

1. Create a project at https://cloud.langfuse.com and copy its keys.
2. Set the env vars (Vercel project settings, or `.env.local`):

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com   # or your self-hosted URL
# Capture prompt/response TEXT into traces (off by default → metadata only).
# When on, emails/secrets/bearer tokens are redacted. Keep OFF in prod unless needed.
LANGFUSE_CAPTURE_IO=0
```

With keys set, every AI feature (review, triage, quote, scaffold, copilot,
changelog, standup, summary, spec critique/revision, docs) produces a complete
trace; with them unset, behavior is unchanged.

## Env vars

| Variable | Role | If absent |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Activate tracing | tracing is a no-op |
| `LANGFUSE_HOST` | Langfuse base URL (Cloud or self-host) | SDK default (Cloud EU) |
| `LANGFUSE_CAPTURE_IO` | `1`/`true` to capture redacted prompt/response text | metadata only (no IO) |
| `LANGFUSE_TRACE_ID` | (CLI) trace the agent run's MCP tool spans nest under | MCP spans no-op |

For the CLI to emit MCP spans, `langfuse` must be installed in the CLI
environment (declared as an **optional** dependency in `cli/package.json`); if
it isn't, or keys are unset, the MCP server silently skips spans.

## Human feedback (Ticket 2)

Every traced AI output can be rated 👍/👎 (+ optional note) via the
`<AiFeedback traceId feature />` widget (`components/ai/ai-feedback.tsx`),
mounted on the AI surfaces (code review, copilot, changelog, standup, summary…).

- Each AI route returns the `traceId` (read from `currentTraceId()` via the
  `withAi` `traceRef` out-param) so the widget can attach feedback to it.
- `POST /api/ai/feedback` — gated by `can(user, 'ai.feedback.create')`,
  rate-limited, writes a row to **`ai_feedback`** *and* mirrors the score to
  Langfuse via `langfuse.score()` (a no-op when Langfuse is off — the DB row is
  always written, so feedback works with or without observability).
- New RBAC actions: `ai.feedback.create` (all internal staff) and
  `ai.traces.read` (admins — used by the dataset export).
- Migration: `supabase/ai-feedback.sql` (also folded into `all.sql`).

The `ai_feedback` rows + Langfuse traces are the raw material for the curated
dataset export (later ticket) used by DSPy / distillation.

## Metrics & Grafana dashboards (Ticket 3)

The AI choke points also emit **Prometheus** metrics (in-process via
`prom-client`, `lib/observability/metrics.ts`) — independent of Langfuse:

| Metric | Type | Labels |
|---|---|---|
| `ai_calls_total` | counter | feature, model, workspace, status |
| `ai_cost_usd_total` | counter | feature, model, workspace |
| `ai_latency_seconds` | histogram | feature, model |
| `ai_feedback_score` | gauge | feature |
| `ai_feedback_total` | counter | feature, score |

- Scrape endpoint: **`GET /api/metrics`** — guarded by `METRICS_TOKEN` (Bearer)
  when set, open otherwise (set it in production). Allow-listed in `middleware.ts`.
- Recorded from `trackedCreate` (calls/cost/latency/status) and the feedback
  route (`recordFeedback`). Best-effort — a metrics error never breaks an AI call.

### Run the dashboards

```bash
docker compose -f docker-compose.observability.yml up
#   Grafana    → http://localhost:3001  (admin / admin)
#   Prometheus → http://localhost:9090
```

Prometheus scrapes the app at `host.docker.internal:3000/api/metrics`
(`observability/prometheus/prometheus.yml` — uncomment the `authorization` block
if `METRICS_TOKEN` is set). Grafana is provisioned as code
(`observability/grafana/`): the **REBUILD — AI Observability** dashboard shows
cost per feature/workspace, calls/sec, p50/p95 latency, quality score and error
rate. Langfuse traces stay in Langfuse Cloud (richer per-trace drill-down).

## Curated dataset export (Ticket 4)

Joins human feedback (`ai_feedback`) with the traced prompt/response (Langfuse)
into JSONL rows `{ feature, promptVersion, input, output, score, note }` — the
input for later **DSPy** prompt optimization / optional distillation (export
only; no training here).

```bash
# admin-only (ai.traces.read); thumbs-up examples for one feature:
rebuild216 ai:export-dataset --feature review --min-score 1 --out review.jsonl
#   filters: --feature  --workspace <id>  --since <ISO>  --min-score <-1|0|1>  --out <file>
```

- CLI command → `GET /api/cli/dataset` (Bearer auth via `userFromBearer`, gated
  by `can(user, 'ai.traces.read')`), in `lib/observability/dataset.ts`.
- `input`/`output` come from Langfuse, so meaningful values require Langfuse +
  `LANGFUSE_CAPTURE_IO=1`. Without it, rows still carry feature/score/note (IO
  null) — the export degrades gracefully.
