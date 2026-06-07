import { SEL, sb } from "@/lib/data"
import { captureSprintSnapshot } from "@/lib/queries"

export const dynamic = "force-dynamic"

// GET /api/cron — daily scheduled job (Vercel Cron). Captures a burndown
// snapshot for every active sprint. Protected by CRON_SECRET: Vercel sends
// `Authorization: Bearer <CRON_SECRET>` when the env var is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const { data: sprints } = await sb()
    .from("sprints")
    .select(SEL.sprint)
    .eq("status", "ACTIVE")
  let captured = 0
  for (const s of sprints ?? []) {
    try {
      await captureSprintSnapshot(s.id as string)
      captured++
    } catch {
      // continue with the next sprint
    }
  }
  return Response.json({ ok: true, sprintsCaptured: captured })
}
