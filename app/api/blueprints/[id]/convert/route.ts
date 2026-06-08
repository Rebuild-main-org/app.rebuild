import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb, SEL } from "@/lib/data"
import { defaultRepoFor } from "@/lib/github"
import { applyScaffoldPlan } from "@/lib/mutations"
import { canApprove, getBlueprint, pendingGates, updateBlueprint } from "@/lib/blueprints"

export const dynamic = "force-dynamic"

// POST /api/blueprints/:id/convert — THE boundary: create the workspace from an
// approved Blueprint and apply its frozen plan (projects + backlog). Requires
// status APPROVED (every gate green) AND workspace.create.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "workspace.create")) {
    return Response.json({ error: "Forbidden — workspace.create requis" }, { status: 403 })
  }
  const { id } = await params
  const bp = await getBlueprint(id)
  if (!bp) return Response.json({ error: "Not found" }, { status: 404 })
  if (bp.status === "CONVERTED") {
    return Response.json({ error: "Déjà converti.", workspaceId: bp.workspaceId }, { status: 409 })
  }
  if (bp.status !== "APPROVED" || !canApprove(bp)) {
    return Response.json(
      { error: "Blueprint non approuvé — gates manquants", pending: pendingGates(bp) },
      { status: 409 }
    )
  }
  if (!bp.plan?.projects?.length) {
    return Response.json({ error: "Plan figé vide — relance « Plan »." }, { status: 409 })
  }

  // 1) Create the workspace (creator becomes an admin member).
  const slug = bp.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"
  const wsId = randomUUID()
  const { data: ws, error: wsErr } = await sb()
    .from("workspaces")
    .insert({
      id: wsId,
      name: bp.title,
      slug,
      github_repo: defaultRepoFor(slug),
      status: "ACTIVE",
      client_name: bp.title,
      client_email: "",
      start_date: new Date().toISOString(),
      technologies: [],
    })
    .select(SEL.workspace)
    .single()
  if (wsErr) return Response.json({ error: wsErr.message }, { status: 400 })
  await sb().from("workspace_members").insert({
    id: randomUUID(),
    user_id: user.id,
    workspace_id: wsId,
    role: "ADMIN",
    joined_at: new Date().toISOString(),
  })

  // 2) Apply the frozen plan (no AI call) → projects + backlog.
  const result = await applyScaffoldPlan(wsId, bp.plan)

  // 3) Mark the blueprint converted.
  await updateBlueprint(id, { status: "CONVERTED", workspace_id: wsId })

  return Response.json({ workspace: ws, ...result }, { status: 201 })
}
