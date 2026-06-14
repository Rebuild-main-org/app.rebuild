// LLM observability (Langfuse). Mirrors the optional-integration doctrine used
// by lib/slack.ts / lib/stripe.ts: ACTIVATES only when LANGFUSE_* env vars are
// set; otherwise every export here is a transparent no-op that never throws.
//
// The whole point: this file is the ONLY place that touches the Langfuse SDK.
// The AI wrappers (lib/ai-usage.ts `withAi`, lib/ai.ts `trackedCreate`) call the
// small, stable interface below — they never branch on "is it enabled" and never
// see the SDK, so with the keys unset the AI features behave byte-for-byte as
// before. Every SDK call is wrapped so a Langfuse outage can't surface to a user.
import "server-only"
import { Langfuse } from "langfuse"

// Env: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST (Cloud or self-host).
export function langfuseEnabled(): boolean {
  return !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

// Capture prompt/response *text* into traces? Off by default (metadata-only) so
// no PII lands in Langfuse unless explicitly opted in per environment.
export function captureIo(): boolean {
  const v = process.env.LANGFUSE_CAPTURE_IO
  return v === "1" || v === "true"
}

let client: Langfuse | null = null
function rawClient(): Langfuse | null {
  if (!langfuseEnabled()) return null
  if (!client) {
    try {
      client = new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST || undefined,
      })
    } catch {
      client = null
    }
  }
  return client
}

// Best-effort redaction applied to any captured IO (emails, bearer/sk keys).
// Conservative on purpose — observability must never leak more than necessary.
export function redact(value: unknown): unknown {
  if (!captureIo()) return undefined
  const scrub = (s: string) =>
    s
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
      .replace(/\b(sk-[A-Za-z0-9_-]{8,}|rbld_[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,})\b/g, "[secret]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
  if (typeof value === "string") return scrub(value)
  try {
    return JSON.parse(scrub(JSON.stringify(value)))
  } catch {
    return undefined
  }
}

// --- Stable internal interface (SDK-agnostic) --------------------------------

export interface ObsGeneration {
  end(args: {
    output?: unknown
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    error?: boolean
    statusMessage?: string
  }): void
}
export interface ObsSpan {
  end(args?: { output?: unknown; error?: boolean; statusMessage?: string }): void
}
export interface ObsTrace {
  readonly id: string
  generation(args: { name: string; model: string; input?: unknown; promptVersion?: string }): ObsGeneration
  span(args: { name: string; input?: unknown }): ObsSpan
}

const NOOP_GEN: ObsGeneration = { end() {} }
const NOOP_SPAN: ObsSpan = { end() {} }
function noopTrace(id: string): ObsTrace {
  return { id, generation: () => NOOP_GEN, span: () => NOOP_SPAN }
}

// Open a trace for one user-facing AI action. `id` is supplied by the caller
// (withAi) so the same id is returned to the UI for feedback EVEN WHEN Langfuse
// is disabled — feedback is decoupled from this integration.
export function startTrace(args: {
  id: string
  name: string
  userId?: string
  metadata?: Record<string, unknown>
  tags?: string[]
}): ObsTrace {
  const c = rawClient()
  if (!c) return noopTrace(args.id)
  try {
    const trace = c.trace({
      id: args.id,
      name: args.name,
      userId: args.userId,
      metadata: args.metadata,
      tags: args.tags,
    })
    return {
      id: args.id,
      generation(g) {
        try {
          const gen = trace.generation({
            name: g.name,
            model: g.model,
            input: g.input,
            metadata: g.promptVersion ? { promptVersion: g.promptVersion } : undefined,
          })
          return {
            end(e) {
              try {
                gen.end({
                  output: e.output,
                  usage: { input: e.inputTokens, output: e.outputTokens, unit: "TOKENS" },
                  metadata: e.costUsd != null ? { costUsd: e.costUsd } : undefined,
                  level: e.error ? "ERROR" : undefined,
                  statusMessage: e.statusMessage,
                })
              } catch {
                /* observability is best-effort */
              }
            },
          }
        } catch {
          return NOOP_GEN
        }
      },
      span(s) {
        try {
          const span = trace.span({ name: s.name, input: s.input })
          return {
            end(e) {
              try {
                span.end({ output: e?.output, level: e?.error ? "ERROR" : undefined, statusMessage: e?.statusMessage })
              } catch {
                /* best-effort */
              }
            },
          }
        } catch {
          return NOOP_SPAN
        }
      },
    }
  } catch {
    return noopTrace(args.id)
  }
}

// Attach a human feedback score to a trace (Langfuse). No-op when disabled.
export function scoreTrace(traceId: string, score: number, note?: string): void {
  const c = rawClient()
  if (!c) return
  try {
    c.score({ traceId, name: "user-feedback", value: score, comment: note || undefined })
  } catch {
    /* best-effort */
  }
}

// Flush buffered events (best-effort). Called after an AI action completes.
export async function flushObservability(): Promise<void> {
  const c = client
  if (!c) return
  try {
    await c.flushAsync()
  } catch {
    /* best-effort */
  }
}
