import { userFromBearer } from "@/lib/cli-auth"
import { isAdmin } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import {
  branchForProject,
  defaultOrg,
  ghComment,
  ghCompareDiff,
  ghOpenOrUpdatePR,
  ghProtectMain,
  githubEnabled,
} from "@/lib/github"
import { AINotConfiguredError, aiEnabled, codeReview } from "@/lib/ai"
import { withAi } from "@/lib/ai-usage"
import type { Project, Workspace } from "@/lib/types"

export const dynamic = "force-dynamic"

function normalize(repo: string): string {
  const r = (repo ?? "").trim()
  return r.includes("/") ? r : `${defaultOrg()}/${r}`
}
// Ops is an org-wide, push-to-main operation: admins and leads only.
async function gate(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return { error: "Unauthorized", status: 401 as const }
  if (!(isAdmin(user.role) || user.role === "LEAD"))
    return { error: "Integration is restricted to admins and leads.", status: 403 as const }
  return { user }
}
async function workspaceForRepo(repo: string): Promise<Workspace | null> {
  const want = normalize(repo).toLowerCase()
  const { data } = await sb().from("workspaces").select(SEL.workspace)
  return ((data ?? []) as Workspace[]).find((w) => normalize(w.githubRepo).toLowerCase() === want) ?? null
}

// GET /api/cli/integration?repo=owner/name — branches that are READY to
// integrate: project branches whose project is REVIEW or DONE.
export async function GET(request: Request) {
  const g = await gate(request)
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status })
  const repo = new URL(request.url).searchParams.get("repo")?.trim()
  if (!repo) return Response.json({ error: "repo is required" }, { status: 400 })

  const ws = await workspaceForRepo(repo)
  if (!ws) return Response.json({ matched: false, target: "main", readyBranches: null })
  const { data: projRows } = await sb().from("projects").select(SEL.project).eq("workspace_id", ws.id)
  const ready = ((projRows ?? []) as Project[])
    .filter((p) => p.status === "REVIEW" || p.status === "DONE")
    .map((p) => branchForProject(p.name, p.shortCode))
  return Response.json({ matched: true, target: "main", readyBranches: [...new Set(ready)] })
}

// POST /api/cli/integration { action: "pr" | "review", ... }
export async function POST(request: Request) {
  const g = await gate(request)
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status })
  if (!githubEnabled()) return Response.json({ error: "GitHub is not configured." }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    repo?: string
    head?: string
    base?: string
    title?: string
    body?: string
    number?: number
  }
  const repo = body.repo ? normalize(body.repo) : ""
  if (!repo) return Response.json({ error: "repo is required" }, { status: 400 })

  if (body.action === "pr") {
    const base = body.base || "main"
    if (!body.head) return Response.json({ error: "head is required" }, { status: 400 })
    await ghProtectMain(repo, base) // best-effort: require review + CI before merge
    const pr = await ghOpenOrUpdatePR(repo, body.head, base, body.title || `Integrate ${body.head}`, body.body || "")
    if (pr.error) return Response.json({ error: pr.error }, { status: 502 })
    return Response.json({ number: pr.number, url: pr.url })
  }

  if (body.action === "review") {
    if (!body.number || !body.head) return Response.json({ error: "number and head are required" }, { status: 400 })
    if (!aiEnabled()) return Response.json({ error: "AI is not configured." }, { status: 503 })
    const diff = await ghCompareDiff(repo, body.base || "main", body.head)
    if (!diff) return Response.json({ skipped: true, reason: "no diff" })
    try {
      const review = await withAi(g.user, "integration-review", () =>
        codeReview({ title: body.title || `Integration PR #${body.number}`, diff })
      )
      const sev = { critical: "🔴", warning: "🟠", info: "🔵" } as const
      const lines = review.findings.map((f) => `- ${sev[f.severity]} **${f.title}** — ${f.detail}`)
      const comment =
        `### 🤖 rebuild216 AI review — grade **${review.score}**\n\n${review.summary}\n\n` +
        (lines.length ? lines.join("\n") : "_No findings._") +
        `\n\n_Automated review. Merge requires CI green${review.findings.some((f) => f.severity === "critical") ? " — ⚠️ critical findings above must be addressed first" : ""}._`
      await ghComment(repo, body.number, comment)
      return Response.json({
        score: review.score,
        critical: review.findings.filter((f) => f.severity === "critical").length,
        findings: review.findings.length,
      })
    } catch (e) {
      if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
      return Response.json({ error: e instanceof Error ? e.message : "Review failed" }, { status: 502 })
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400 })
}
