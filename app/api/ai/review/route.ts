import { AINotConfiguredError, codeReview } from "@/lib/ai"
import { AiBudgetError, withAi } from "@/lib/ai-usage"
import { repoFiles } from "@/lib/queries"
import { SEL, sb, userById } from "@/lib/data"
import type { PullRequest } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"
import { rateLimitResponse } from "@/lib/ratelimit"

// POST /api/ai/review — AI code review for a PR. Builds a diff from the
// workspace's changed repo files (the working set behind the PR).
export async function POST(request: Request) {
  const { wsId, prNumber } = (await request.json()) as {
    wsId?: string
    prNumber?: number
  }
  if (!wsId) return Response.json({ error: "wsId required" }, { status: 400 })
  const auth = await requireWorkspace(wsId, "copilot.use")
  if (auth instanceof Response) return auth
  const rl = rateLimitResponse(`ai:${auth.id}`, 20, 60_000)
  if (rl) return rl

  const { data: prRow } = await sb()
    .from("pull_requests")
    .select(SEL.pr)
    .eq("workspace_id", wsId)
    .eq("number", prNumber ?? -1)
    .maybeSingle()
  const pr = prRow as PullRequest | null
  const title = pr?.title ?? "Working changes"
  let ticket: string | undefined
  if (pr?.ticketId) {
    const { data: t } = await sb().from("tickets").select("short_id").eq("id", pr.ticketId).maybeSingle()
    ticket = (t?.short_id as string) ?? undefined
  }

  const changed = (await repoFiles(wsId)).filter((f) => f.status !== "unmodified")
  const diff =
    changed.length > 0
      ? changed
          .map(
            (f) =>
              `--- ${f.path} (${f.status})\n${f.originalContent ? `# before\n${f.originalContent}\n` : ""}# after\n${f.content}`
          )
          .join("\n\n")
          .slice(0, 12000)
      : "No working changes detected; reviewing PR metadata only."

  try {
    const review = await withAi(auth, "review", () => codeReview({ title, diff, ticket }), { workspaceId: wsId })
    return Response.json({
      review,
      pr: pr
        ? { number: pr.number, title: pr.title, author: (await userById(pr.authorId))?.name }
        : null,
    })
  } catch (e) {
    if (e instanceof AiBudgetError) return Response.json({ error: e.message }, { status: 429 })
    if (e instanceof AINotConfiguredError) {
      return Response.json({ error: e.message }, { status: 503 })
    }
    return Response.json({ error: "AI review failed" }, { status: 502 })
  }
}
