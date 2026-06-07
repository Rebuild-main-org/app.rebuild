// Next.js instrumentation hook. Initializes Sentry when both the package is
// installed (`npm i @sentry/nextjs`) and SENTRY_DSN is set. Fully guarded so
// the app builds and runs without either — observability is opt-in. The import
// specifier is non-literal on purpose so TypeScript doesn't require the package.

type SentryLike = {
  init: (opts: Record<string, unknown>) => void
  captureException: (err: unknown) => void
  captureRequestError?: (err: unknown, request: unknown, context: unknown) => void
}

async function loadSentry(): Promise<SentryLike | null> {
  if (!process.env.SENTRY_DSN) return null
  try {
    const pkg = "@sentry/nextjs"
    // Optional dependency: tell the bundlers not to resolve it at build time
    // (imported only at runtime when SENTRY_DSN is set and the pkg is installed).
    return (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg)) as unknown as SentryLike
  } catch {
    return null
  }
}

export async function register() {
  const Sentry = await loadSentry()
  if (!Sentry) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  })
}

// Captures uncaught errors from React Server Components / route handlers.
export async function onRequestError(err: unknown, request: unknown, context: unknown) {
  const Sentry = await loadSentry()
  if (!Sentry) return
  if (Sentry.captureRequestError) Sentry.captureRequestError(err, request, context)
  else Sentry.captureException(err)
}
