import { adminConfigured, supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseConfigured } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Health check (spec §18). Reports real connectivity to Supabase when the
// service role is configured.
export async function GET() {
  const services: Record<string, string> = {
    auth: supabaseConfigured() ? "configured" : "unconfigured",
    ai: process.env.ANTHROPIC_API_KEY ? "configured" : "unconfigured",
    github: process.env.GITHUB_TOKEN ? "configured" : "unconfigured",
  }

  let dbStatus = "unconfigured"
  if (adminConfigured()) {
    try {
      const { error } = await supabaseAdmin()
        .from("profiles")
        .select("id", { count: "exact", head: true })
      dbStatus = error ? `error: ${error.message}` : "up"
    } catch (e) {
      dbStatus = `error: ${e instanceof Error ? e.message : "unreachable"}`
    }
  }
  services.database = dbStatus

  const ok = dbStatus === "up" || dbStatus === "unconfigured"
  return Response.json(
    { status: ok ? "ok" : "degraded", services, time: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  )
}
