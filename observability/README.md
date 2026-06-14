# Observability & continuous-improvement

LLM observability for REBUILD Engineering OS. **Optional and fail-safe**: with no
`LANGFUSE_*` env vars set, the whole layer is a transparent no-op — the AI
features behave byte-for-byte as without it (same doctrine as Slack/Stripe/Vercel
integrations). Nothing here changes AI behavior; it only observes.

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
