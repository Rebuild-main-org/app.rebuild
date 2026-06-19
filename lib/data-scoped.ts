// Request-scoped data access — the tenant-safe counterpart to lib/data.ts.
//
// Same SEL column maps, but backed by the COOKIE-SCOPED Supabase client
// (lib/supabase/server.ts), so RLS enforces tenant isolation in the database
// instead of relying on every handler remembering to filter by org.
//
// Conversion recipe (see app/api/admin/finance/route.ts for the reference):
//   - `import { sb, SEL } from "@/lib/data"`  ->  `import { sbScoped, SEL } from "@/lib/data-scoped"`
//   - `sb().from(...)`                        ->  `(await sbScoped()).from(...)`
//   - on INSERT: add `org_id: tenant.orgId` (from `requireTenant()`)
//   - drop any manual `.eq("workspace_id"/"org_id", ...)` tenant filter — RLS does it.
//
// Keep lib/data.ts (`sb` = service-role) ONLY for genuinely cross-tenant paths
// (cron, webhooks, platform admin), and always pass an explicit org_id filter there.

import "server-only"
import { createClient } from "@/lib/supabase/server"

export { SEL } from "@/lib/data"

export async function sbScoped() {
  return createClient()
}
