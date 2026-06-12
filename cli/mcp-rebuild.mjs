#!/usr/bin/env node
// MCP stdio server "rebuild" — exposes the REBUILD platform to Claude Code so
// the agent can read tickets and move them through the workflow. Launched by
// rebuild216 with env: REBUILD_URL, REBUILD_TOKEN, REBUILD_PROJECT.
//
// Requires: @modelcontextprotocol/sdk

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

const URL_BASE = process.env.REBUILD_URL 
let TOKEN = process.env.REBUILD_TOKEN || ""
let REFRESH = process.env.REBUILD_REFRESH_TOKEN || ""
const PROJECT = process.env.REBUILD_PROJECT || ""

// Exchange the refresh token for a fresh access token (Supabase access tokens
// are short-lived; long agent runs outlive them). Returns true on success.
async function refreshToken() {
  if (!REFRESH) return false
  try {
    const res = await fetch(`${URL_BASE}/api/cli/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: REFRESH }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (!data.token) return false
    TOKEN = data.token
    if (data.refreshToken) REFRESH = data.refreshToken
    return true
  } catch {
    return false
  }
}

async function rawApi(path, init) {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  return { res, data: text ? JSON.parse(text) : {} }
}

async function api(path, init = {}) {
  let { res, data } = await rawApi(path, init)
  // Token expired mid-run → refresh once and retry, so writes don't start
  // failing after the initial (still-valid) context read.
  if (res.status === 401 && (await refreshToken())) {
    ;({ res, data } = await rawApi(path, init))
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const TOOLS = [
  {
    name: "list_tickets",
    description: "List the project's tickets with their current status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_ticket",
    description:
      "Create a fully-populated ticket on the project board (use this to build a backlog). Fill as many fields as make sense: a clear description, priority, estimate (points), labels, assignee, and relationships. type ∈ TASK, BUG, FEATURE, REVIEW, EPIC, SPIKE, SUBTASK; priority ∈ CRITICAL, HIGH, MEDIUM, LOW; status defaults to BACKLOG. assignee is \"me\" or a member's email. parentShortId makes this a sub-task of that ticket. links connect to other tickets (type ∈ BLOCKS, RELATES, DUPLICATES). comment adds an initial note; timeMinutes logs time.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "Markdown description: context, acceptance criteria, notes." },
        type: { type: "string", enum: ["TASK", "BUG", "FEATURE", "REVIEW", "EPIC", "SPIKE", "SUBTASK"] },
        priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
        status: { type: "string", enum: ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] },
        points: { type: "number", description: "Story-point estimate." },
        labels: { type: "array", items: { type: "string" } },
        dueDate: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        assignee: { type: "string", description: '"me" or a workspace member email.' },
        parentShortId: { type: "string", description: "Parent ticket short id → makes this a sub-task." },
        links: {
          type: "array",
          items: {
            type: "object",
            properties: {
              toShortId: { type: "string" },
              type: { type: "string", enum: ["BLOCKS", "RELATES", "DUPLICATES"] },
            },
            required: ["toShortId"],
          },
        },
        comment: { type: "string" },
        timeMinutes: { type: "number" },
        timeNote: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_ticket_status",
    description:
      "Move a ticket to a new workflow status. status ∈ BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE.",
    inputSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string" },
        status: { type: "string", enum: ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] },
      },
      required: ["ticketId", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "add_comment",
    description: "Add a comment to a ticket (progress notes, decisions).",
    inputSchema: {
      type: "object",
      properties: { ticketId: { type: "string" }, comment: { type: "string" } },
      required: ["ticketId", "comment"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_screenshots",
    description:
      "Capture full-page screenshots of the running app and upload them to the project's Documents. Call this after running tests, once the dev server is up. Provide its baseUrl (e.g. http://localhost:3000) and the routes exercised by the workflow. Uses Playwright (installed on demand).",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Base URL of the running app, e.g. http://localhost:3000" },
        routes: { type: "array", items: { type: "string" }, description: "Paths to capture, e.g. [\"/\", \"/login\", \"/dashboard\"]" },
        label: { type: "string", description: "Prefix for the document names, e.g. the ticket short id." },
      },
      required: ["routes"],
      additionalProperties: false,
    },
  },
  {
    name: "upload_screenshot",
    description: "Upload a single image file (PNG/JPEG) from disk to the project's Documents.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or repo-relative path to the image file." },
        name: { type: "string", description: "Document name to show in the UI." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
]

// Read an image file → data URL.
function fileToDataUrl(p) {
  const ext = path.extname(p).toLowerCase()
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/png"
  const buf = fs.readFileSync(p)
  return { mime, dataUrl: `data:${mime};base64,${buf.toString("base64")}` }
}

async function uploadDoc(name, p) {
  const { mime, dataUrl } = fileToDataUrl(p)
  await api(`/api/cli/document`, {
    method: "POST",
    body: JSON.stringify({ project: PROJECT, name, mimeType: mime, dataUrl }),
  })
}

// Run `playwright screenshot`; install chromium on demand if missing.
function playwrightShot(url, file) {
  const args = ["-y", "playwright", "screenshot", "--full-page", "--wait-for-timeout", "800", url, file]
  let r = spawnSync("npx", args, { encoding: "utf8" })
  if (r.status !== 0 && /Executable doesn't exist|playwright install/i.test((r.stderr || "") + (r.stdout || ""))) {
    spawnSync("npx", ["-y", "playwright", "install", "chromium"], { encoding: "utf8", stdio: "ignore" })
    r = spawnSync("npx", args, { encoding: "utf8" })
  }
  return r
}

const server = new Server({ name: "rebuild", version: "1.0.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params
  try {
    if (name === "list_tickets") {
      const ctx = await api(`/api/cli/context?project=${encodeURIComponent(PROJECT)}`)
      return { content: [{ type: "text", text: JSON.stringify(ctx.tickets, null, 2) }] }
    }
    if (name === "create_ticket") {
      const t = await api(`/api/cli/ticket/create`, {
        method: "POST",
        body: JSON.stringify({ project: PROJECT, ...args }),
      })
      const extra = [
        t.assigneeId ? "assigned" : null,
        t.parentId ? "sub-task" : null,
        t.links?.length ? `linked: ${t.links.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      return {
        content: [
          { type: "text", text: `Created ${t.shortId} (${t.status}) — ${t.title}${extra ? ` [${extra}]` : ""}` },
        ],
      }
    }
    if (name === "update_ticket_status") {
      await api(`/api/cli/ticket`, {
        method: "POST",
        body: JSON.stringify({ ticketId: args.ticketId, status: args.status }),
      })
      return { content: [{ type: "text", text: `Ticket ${args.ticketId} → ${args.status}` }] }
    }
    if (name === "add_comment") {
      await api(`/api/cli/ticket`, {
        method: "POST",
        body: JSON.stringify({ ticketId: args.ticketId, comment: args.comment }),
      })
      return { content: [{ type: "text", text: `Comment added to ${args.ticketId}` }] }
    }
    if (name === "upload_screenshot") {
      if (!fs.existsSync(args.path)) {
        return { content: [{ type: "text", text: `File not found: ${args.path}` }], isError: true }
      }
      const docName = args.name || path.basename(args.path)
      await uploadDoc(docName, args.path)
      return { content: [{ type: "text", text: `Uploaded "${docName}" to ${PROJECT} Documents.` }] }
    }
    if (name === "capture_screenshots") {
      const base = (args.baseUrl || "http://localhost:3000").replace(/\/$/, "")
      const routes = Array.isArray(args.routes) ? args.routes : []
      if (routes.length === 0) {
        return { content: [{ type: "text", text: "No routes provided." }], isError: true }
      }
      const label = (args.label || "screenshot").replace(/[^\w.\- ]+/g, "_")
      const out = []
      for (const route of routes) {
        const url = base + (route.startsWith("/") ? route : "/" + route)
        const slug = route.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "home"
        const file = path.join(os.tmpdir(), `rb216-${Date.now()}-${slug}.png`)
        const r = playwrightShot(url, file)
        if (r.status !== 0 || !fs.existsSync(file)) {
          out.push(`✗ ${route}: ${(r.stderr || r.stdout || "capture failed").trim().slice(0, 160)}`)
          continue
        }
        try {
          await uploadDoc(`${label} — ${slug}.png`, file)
          out.push(`✓ ${route}`)
        } catch (e) {
          out.push(`✗ ${route}: upload failed — ${e.message}`)
        } finally {
          try { fs.unlinkSync(file) } catch { /* ignore */ }
        }
      }
      return { content: [{ type: "text", text: `Screenshots → ${PROJECT} Documents:\n${out.join("\n")}` }] }
    }
    return { content: [{ type: "text", text: `Unknown tool ${name}` }], isError: true }
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }
  }
})

await server.connect(new StdioServerTransport())
