// Minimal structured logger. Emits single-line JSON so logs are queryable in
// Vercel / any log drain. Use instead of bare console in server code.

type Level = "debug" | "info" | "warn" | "error"

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...meta, t: new Date().toISOString() })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
}
