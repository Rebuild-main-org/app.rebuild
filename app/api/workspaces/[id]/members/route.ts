import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import { membersForWorkspace } from "@/lib/queries"
import type { Role, User } from "@/lib/types"
import { requireWorkspace } from "@/lib/auth/guard"
import { emailEnabled, sendEmail, layout, appUrl } from "@/lib/email"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  return Response.json(await membersForWorkspace(id))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getSessionUser()
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(actor, "member.invite")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const _access = await requireWorkspace(id)
  if (_access instanceof Response) return _access
  const { email, role } = (await request.json()) as { email?: string; role?: Role }
  if (!email) return Response.json({ error: "email is required" }, { status: 400 })

  // Find an existing directory user by email, else create a placeholder.
  const { data: existingUser } = await sb()
    .from("users")
    .select(SEL.user)
    .ilike("email", email)
    .maybeSingle()
  let user = existingUser as User | null
  if (!user) {
    const newUser = {
      id: randomUUID(),
      email,
      name: email.split("@")[0],
      role: role ?? "ENGINEER",
    }
    const { error } = await sb().from("users").insert(newUser)
    if (error) return Response.json({ error: error.message }, { status: 400 })
    user = newUser
  }

  const { data: existingMember } = await sb()
    .from("workspace_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", id)
    .maybeSingle()
  if (existingMember) {
    return Response.json({ error: "Already a member" }, { status: 409 })
  }

  const member = {
    id: randomUUID(),
    user_id: user.id,
    workspace_id: id,
    role: role ?? "ENGINEER",
    joined_at: new Date().toISOString(),
  }
  const { error } = await sb().from("workspace_members").insert(member)
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (emailEnabled() && user.email) {
    try {
      await sendEmail({
        to: user.email,
        subject: `You've been added to a workspace on REBUILD`,
        html: layout(
          "You've been invited",
          `<p>${actor.name} added you to a workspace as <b>${member.role}</b>.</p><p><a href="${appUrl("/dashboard")}">Sign in to REBUILD</a></p>`
        ),
      })
    } catch {
      // best-effort
    }
  }
  return Response.json(
    { id: member.id, userId: user.id, workspaceId: id, role: member.role, joinedAt: member.joined_at, user },
    { status: 201 }
  )
}
