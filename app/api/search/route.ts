import { requireAuth } from "@/lib/auth/guard"
import { can } from "@/lib/auth"
import { globalSearch } from "@/lib/queries"

export const dynamic = "force-dynamic"

// GET /api/search?q= — membership-scoped global search.
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const q = new URL(request.url).searchParams.get("q") ?? ""
  const results = await globalSearch(auth, q, can(auth, "crm.view"))
  return Response.json(results)
}
