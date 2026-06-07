import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { sb, SEL } from "@/lib/data"
import { workspacesForUser } from "@/lib/queries"
import type { Workspace } from "@/lib/types"
import { defaultRepoFor } from "@/lib/github"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json(await workspacesForUser(user.id, user.role))
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "workspace.create")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = (await request.json()) as Partial<Workspace>
  if (!body.name) return Response.json({ error: "name is required" }, { status: 400 })

  const slug =
    body.slug ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const id = randomUUID()
  const row = {
    id,
    name: body.name,
    slug,
    github_repo: body.githubRepo ?? defaultRepoFor(slug),
    status: body.status ?? "ACTIVE",
    client_name: body.clientName ?? body.name,
    client_email: body.clientEmail ?? "",
    start_date: new Date().toISOString(),
    technologies: body.technologies ?? [],
  }
  const { data, error } = await sb().from("workspaces").insert(row).select(SEL.workspace).single()
  if (error) return Response.json({ error: error.message }, { status: 400 })

  // Creator becomes an admin member.
  await sb().from("workspace_members").insert({
    id: randomUUID(),
    user_id: user.id,
    workspace_id: id,
    role: "ADMIN",
    joined_at: new Date().toISOString(),
  })
  return Response.json(data, { status: 201 })
}
