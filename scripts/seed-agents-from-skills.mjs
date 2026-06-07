#!/usr/bin/env node
// One-off ingestion: turn a directory of Claude "skills" (each a folder with a
// SKILL.md + optional references/) into REBUILD AI Agents in Supabase.
//
//   node scripts/seed-agents-from-skills.mjs [skillsDir]
//
// Default skillsDir: /tmp/claude-skills/skills
// Idempotent: re-running upserts the same agents/files (deterministic ids).

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.join(HERE, "..")
const SKILLS_DIR = process.argv[2] || "/tmp/claude-skills/skills"
const NUL = String.fromCharCode(0)
// Namespacing so different skill packs don't collide and stay labelled.
const ID_PREFIX = process.env.REBUILD_ID_PREFIX || "agent_skill_"
const NAME_SUFFIX = process.env.REBUILD_NAME_SUFFIX || ""
const EXTRA_KIND = process.env.REBUILD_EXTRA_KIND || "knowledge" // kind for non-SKILL.md files

// --- env (read .env / .env.local without a dependency) ----------------------
function loadEnv() {
  const env = {}
  for (const f of [".env", ".env.local"]) {
    const p = path.join(APP, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (env[m[1]] === undefined) env[m[1]] = v
    }
  }
  return env
}
const env = loadEnv()
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env).")
  process.exit(1)
}
const sb = createClient(SUPA_URL, KEY, { auth: { persistSession: false } })

// --- helpers ----------------------------------------------------------------
const ACRONYMS = {
  cpp: "C++", csharp: "C#", sql: "SQL", php: "PHP", api: "API", cli: "CLI",
  graphql: "GraphQL", mcp: "MCP", rag: "RAG", sre: "SRE", ml: "ML",
  dotnet: ".NET", nestjs: "NestJS", nextjs: "Next.js", fastapi: "FastAPI",
  js: "JS", websocket: "WebSocket", ngrx: "NgRx",
}
function titleize(slug) {
  return slug
    .split("-")
    .map((t) => ACRONYMS[t] || t.charAt(0).toUpperCase() + t.slice(1))
    .join(" ")
}
// Split a SKILL.md into { fm: {name, description, role, domain}, body }.
function parseSkill(raw) {
  const fm = {}
  let body = raw
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3)
    if (end !== -1) {
      const block = raw.slice(3, end)
      body = raw.slice(end + 4).replace(/^\s+/, "")
      for (const key of ["name", "description", "domain", "role"]) {
        const m = block.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"))
        if (m) fm[key] = m[1].trim().replace(/^["']|["']$/g, "")
      }
    }
  }
  return { fm, body }
}
function listFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(dir, path.join(d.parentPath || d.path, d.name)))
}

// --- ingest -----------------------------------------------------------------
const slugs = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

console.log(`Ingesting ${slugs.length} skills from ${SKILLS_DIR}...\n`)
let agentsDone = 0
let filesDone = 0
const failures = []

for (const slug of slugs) {
  const dir = path.join(SKILLS_DIR, slug)
  const skillPath = path.join(dir, "SKILL.md")
  if (!fs.existsSync(skillPath)) {
    failures.push(`${slug}: no SKILL.md`)
    continue
  }
  const raw = fs.readFileSync(skillPath, "utf8")
  const { fm, body } = parseSkill(raw)
  const name = titleize(slug) + NAME_SUFFIX
  const description = fm.description || `${name} agent.`
  const agentId = `${ID_PREFIX}${slug}`

  const soul =
    `# ${name}\n\n` +
    `You are **${name}**, a ${fm.role || "specialist"} agent` +
    (fm.domain ? ` for the ${fm.domain} domain` : "") +
    `.\n\n${description}\n\n` +
    `Follow the practices defined in skills.md. Consult the references/ knowledge files when relevant.\n`

  const files = [
    { name: "soul.md", kind: "doc", content: soul },
    { name: "skills.md", kind: "doc", content: body || raw },
  ]
  // Every other file in the skill dir (DESIGN.md, references/*, …) → a file.
  for (const rel of listFiles(dir)) {
    if (rel === "SKILL.md") continue
    let content
    try {
      content = fs.readFileSync(path.join(dir, rel), "utf8")
    } catch {
      continue
    }
    if (content.includes(NUL)) continue // skip binary
    files.push({ name: rel.split(path.sep).join("/"), kind: EXTRA_KIND, content })
  }

  try {
    const { error: aErr } = await sb
      .from("agents")
      .upsert({ id: agentId, name, description, updated_at: new Date().toISOString() }, { onConflict: "id" })
    if (aErr) throw aErr

    const rows = files.map((f) => ({
      id: `${agentId}__${f.name.replace(/[^a-z0-9]+/gi, "_")}`,
      agent_id: agentId,
      name: f.name,
      kind: f.kind,
      content: f.content,
      updated_at: new Date().toISOString(),
    }))
    const { error: fErr } = await sb.from("agent_files").upsert(rows, { onConflict: "agent_id,name" })
    if (fErr) throw fErr

    agentsDone++
    filesDone += rows.length
    console.log(`  ok ${name}  (${rows.length} files)`)
  } catch (e) {
    failures.push(`${slug}: ${e.message || e}`)
    console.log(`  FAIL ${name}: ${e.message || e}`)
  }
}

console.log(`\nDone: ${agentsDone} agents, ${filesDone} files.`)
if (failures.length) {
  console.log(`Failures (${failures.length}):`)
  for (const f of failures) console.log(`  - ${f}`)
}
