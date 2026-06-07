import { userFromBearer } from "@/lib/cli-auth"
import { isAdmin } from "@/lib/auth"
import { ghOrgRepos, githubEnabled } from "@/lib/github"

export const dynamic = "force-dynamic"

// GET /api/cli/repos (Bearer) — list the organization's repositories for the
// CLI "ops" integration mode. Restricted to admins/leads (org-wide operation).
export async function GET(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!(isAdmin(user.role) || user.role === "LEAD")) {
    return Response.json({ error: "Ops mode is restricted to admins and leads." }, { status: 403 })
  }
  if (!githubEnabled()) {
    return Response.json({ error: "GitHub is not configured on the server." }, { status: 503 })
  }
  const repos = await ghOrgRepos(100)
  return Response.json({ org: process.env.GITHUB_DEFAULT_ORG || "Rebuild-main-org", repos })
}
