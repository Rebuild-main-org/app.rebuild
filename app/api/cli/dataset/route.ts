import { userFromBearer } from "@/lib/cli-auth"
import { can } from "@/lib/auth"
import { buildDataset, toJsonl, type DatasetFilter } from "@/lib/observability/dataset"

export const dynamic = "force-dynamic"

// GET /api/cli/dataset — curated AI dataset as JSONL (Bearer auth, for the
// `rebuild216 ai:export-dataset` command). Gated by ai.traces.read.
// Filters: ?feature= &workspace= &since=<ISO> &minScore=<-1|0|1>
export async function GET(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "ai.traces.read")) return Response.json({ error: "Forbidden" }, { status: 403 })

  const u = new URL(request.url)
  const filter: DatasetFilter = {
    feature: u.searchParams.get("feature") || undefined,
    workspaceId: u.searchParams.get("workspace") || undefined,
    since: u.searchParams.get("since") || undefined,
    minScore: u.searchParams.has("minScore") ? Number(u.searchParams.get("minScore")) : undefined,
  }
  const rows = await buildDataset(filter)
  return new Response(toJsonl(rows), {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": 'attachment; filename="ai-dataset.jsonl"',
    },
  })
}
