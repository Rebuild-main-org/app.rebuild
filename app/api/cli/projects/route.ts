import { SEL, sb } from "@/lib/data"
import { userFromBearer } from "@/lib/cli-auth"
import { isAdmin } from "@/lib/auth"
import { defaultOrg } from "@/lib/github"
import type { Project, Workspace } from "@/lib/types"

export const dynamic = "force-dynamic"

function normalizeRepo(repo?: string | null): string {
  const r = (repo ?? "").trim()
  if (!r) return ""
  return r.includes("/") ? r : `${defaultOrg()}/${r}`
}

// GET /api/cli/projects → projects the caller can access (for the picker).
export async function GET(request: Request) {
  const user = await userFromBearer(request)
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Accessible workspace ids (ADMIN / SUPER_ADMIN see all).
  let wsIds: string[] | null = null
  if (!isAdmin(user.role)) {
    const { data: members } = await sb()
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
    wsIds = (members ?? []).map((m) => m.workspace_id as string)
    if (wsIds.length === 0) return Response.json({ projects: [] })
  }

  let pq = sb().from("projects").select(SEL.project).order("name")
  if (wsIds) pq = pq.in("workspace_id", wsIds)
  const { data: projRows } = await pq
  const projects = (projRows ?? []) as Project[]

  const { data: wsRows } = await sb().from("workspaces").select(SEL.workspace)
  const wsMap = new Map((wsRows ?? []).map((w) => [(w as Workspace).id, w as Workspace]))

  return Response.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      shortCode: p.shortCode,
      status: p.status,
      workspace: wsMap.get(p.workspaceId)?.name ?? "",
      repo: normalizeRepo(wsMap.get(p.workspaceId)?.githubRepo),
    })),
  })
}
