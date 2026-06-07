// Read versioned agent docs/prompts from the repo at runtime, with graceful
// fallback. Files are shipped via next.config `outputFileTracingIncludes`.
import "server-only"
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()

// Raw file content relative to the project root, or null if unreadable.
export function readRepoFile(relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), "utf8")
  } catch {
    return null
  }
}

// List files (recursive) under a repo-relative dir, or [] if missing.
export function listRepoFiles(relDir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(ROOT, relDir), { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const base = (d.parentPath || d.path).slice(path.join(ROOT, relDir).length).replace(/^[\\/]/, "")
        return base ? `${base}/${d.name}` : d.name
      })
      .map((p) => p.split(path.sep).join("/"))
  } catch {
    return []
  }
}

// A server-function system prompt sourced from prompts/<name>.md. The human
// header (everything up to a `<!-- SYSTEM -->` marker) is stripped; only the
// body after the marker is returned. Returns null if the file or marker is
// absent, so callers keep their inline default.
export function loadSystemPrompt(name: string): string | null {
  const raw = readRepoFile(`prompts/${name}.md`)
  if (!raw) return null
  const marker = "<!-- SYSTEM -->"
  const idx = raw.indexOf(marker)
  if (idx === -1) return null
  const body = raw.slice(idx + marker.length).trim()
  return body.length > 0 ? body : null
}
