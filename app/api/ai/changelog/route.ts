import { requireWorkspace } from "@/lib/auth/guard"
import { AINotConfiguredError, changelogFromPRs } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { prsForWorkspace } from "@/lib/queries"
import type { PullRequest } from "@/lib/types"

// POST /api/ai/changelog — release notes from merged PRs.
export async function POST(request: Request) {
  const { wsId } = (await request.json()) as { wsId?: string }
  const auth = await requireWorkspace(wsId, "copilot.use")
  if (auth instanceof Response) return auth

  const prs = (await prsForWorkspace(wsId!)) as PullRequest[]
  const merged = prs.filter((p) => p.status === "MERGED")
  if (merged.length === 0) {
    return Response.json({ changelog: "_No merged pull requests yet._" })
  }
  const content = merged
    .map((p) => `- #${p.number} ${p.title} (${p.branchFrom} → ${p.branchTo})`)
    .join("\n")

  try {
    const changelog = await withAi(auth, "changelog", () => changelogFromPRs(content), { workspaceId: wsId })
    return Response.json({ changelog })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) return Response.json({ error: e.message }, { status: 503 })
    return Response.json({ error: "Changelog failed" }, { status: 502 })
  }
}
