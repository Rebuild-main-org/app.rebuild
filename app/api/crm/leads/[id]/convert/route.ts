import { randomUUID } from "crypto"

import { getSessionUser } from "@/lib/auth/session"
import { can, isAdmin } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import type { Lead } from "@/lib/types"
import { defaultRepoFor, ensureRepo, githubEnabled, ghWireWorkspaceWebhook } from "@/lib/github"
import { audit, uniqueShortCode } from "@/lib/mutations"

interface ConvertBody {
  projectName?: string
  projectShortCode?: string
  deliveryLeadId?: string
}

// Stages a lead must reach before it can become real delivery work.
const CONVERTIBLE = new Set(["QUALIFIED", "PROPOSAL", "WON"])

// Find a workspace slug not yet taken (slugs are unique in the DB).
async function uniqueSlug(base: string): Promise<string> {
  for (let i = 1; i < 1000; i++) {
    const cand = i === 1 ? base : `${base}-${i}`
    const { data } = await sb().from("workspaces").select("id").eq("slug", cand).maybeSingle()
    if (!data) return cand
  }
  return `${base}-${randomUUID().slice(0, 6)}`
}

// POST /api/crm/leads/:id/convert — turn a qualified lead into delivery work:
// reuse the client's existing workspace if one exists (one workspace = one
// client/account), else create one with a provisioned repo, then seed a project
// on a unique short code. Body (optional): { projectName, projectShortCode,
// deliveryLeadId }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!can(user, "crm.manage")) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data: leadRow } = await sb().from("leads").select(SEL.lead).eq("id", id).maybeSingle()
  const lead = leadRow as Lead | null
  if (!lead) return Response.json({ error: "Not found" }, { status: 404 })
  if (lead.workspaceId) return Response.json({ error: "Lead already converted" }, { status: 409 })

  // P2-1: don't convert a raw/lost lead — it must be qualified first.
  if (!CONVERTIBLE.has(lead.stage)) {
    return Response.json(
      { error: "Qualify the lead (QUALIFIED, PROPOSAL or WON) before converting it." },
      { status: 400 }
    )
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as ConvertBody
  const now = new Date().toISOString()

  // P1-1: one workspace per client. Reuse the client's existing workspace
  // (matched by email) instead of spawning a duplicate; otherwise create one.
  let existing: { id: string; slug: string } | null = null
  if (lead.contactEmail) {
    const { data } = await sb()
      .from("workspaces")
      .select("id,slug")
      .ilike("client_email", lead.contactEmail)
      .limit(1)
      .maybeSingle()
    existing = (data as { id: string; slug: string } | null) ?? null
  }

  let wsId: string
  let slug: string
  let repo: string | null = null
  if (existing) {
    wsId = existing.id
    slug = existing.slug
  } else {
    // P1-2: a slug (and therefore repo name) that's actually free.
    const base =
      lead.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
      `client-${randomUUID().slice(0, 6)}`
    slug = await uniqueSlug(base)

    // P0-2: actually provision (or verify) the workspace repo on GitHub so the
    // CLI can clone it and create per-project branches.
    repo = defaultRepoFor(slug)
    if (githubEnabled()) {
      const r = await ensureRepo(repo)
      if (r.error) {
        return Response.json(
          { error: `Could not provision the GitHub repo (${repo}): ${r.error}` },
          { status: 502 }
        )
      }
      repo = r.fullName ?? repo
    }

    wsId = randomUUID()
    const { error: wsErr } = await sb().from("workspaces").insert({
      id: wsId,
      name: lead.company,
      slug,
      github_repo: repo,
      status: "ACTIVE",
      client_name: lead.contactName || lead.company,
      client_email: lead.contactEmail,
      start_date: now,
      technologies: [],
    })
    if (wsErr) return Response.json({ error: wsErr.message }, { status: 400 })
    await audit("workspace.create", "Workspace", wsId, user.id)
    // Wire the GitHub webhook so commits/PRs/CI flow back into the app.
    if (githubEnabled()) await ghWireWorkspaceWebhook(repo, wsId)
  }

  // The converter joins (ADMIN if already an admin, else LEAD). ignoreDuplicates
  // so reusing a workspace never downgrades an existing membership.
  await sb()
    .from("workspace_members")
    .upsert(
      {
        id: randomUUID(),
        user_id: user.id,
        workspace_id: wsId,
        role: isAdmin(user.role) ? "ADMIN" : "LEAD",
        joined_at: now,
      },
      { onConflict: "user_id,workspace_id", ignoreDuplicates: true }
    )

  // P2-2: the chosen delivery lead (decoupled from the sales rep who converts).
  if (body.deliveryLeadId && body.deliveryLeadId !== user.id) {
    await sb()
      .from("workspace_members")
      .upsert(
        {
          id: randomUUID(),
          user_id: body.deliveryLeadId,
          workspace_id: wsId,
          role: "LEAD",
          joined_at: now,
        },
        { onConflict: "user_id,workspace_id", ignoreDuplicates: true }
      )
  }

  // P0-1: seed the delivery project on a short code unique within the workspace.
  const projectName = (body.projectName || "Delivery").trim() || "Delivery"
  const shortCode = await uniqueShortCode(wsId, body.projectShortCode || slug.replace(/-/g, ""))
  const projectId = randomUUID()
  const { error: projErr } = await sb().from("projects").insert({
    id: projectId,
    name: projectName,
    short_code: shortCode,
    status: "PLANNING",
    workspace_id: wsId,
    description: `Delivery for ${lead.company}.`,
    start_date: now,
  })
  if (projErr) return Response.json({ error: projErr.message }, { status: 400 })
  await audit("project.create", "Project", projectId, user.id)

  // Provision the client as a CLIENT member (reconciled to their Auth id on
  // first login by syncUserDirectory). Idempotent.
  if (lead.contactEmail) {
    const { data: existingClient } = await sb()
      .from("users")
      .select("id")
      .ilike("email", lead.contactEmail)
      .maybeSingle()
    let clientId = existingClient?.id as string | undefined
    if (!clientId) {
      clientId = randomUUID()
      await sb().from("users").insert({
        id: clientId,
        email: lead.contactEmail,
        name: lead.contactName || lead.company,
        role: "CLIENT",
      })
    }
    await sb()
      .from("workspace_members")
      .upsert(
        { id: randomUUID(), user_id: clientId, workspace_id: wsId, role: "CLIENT", joined_at: now },
        { onConflict: "user_id,workspace_id", ignoreDuplicates: true }
      )
  }

  // Link any AI-drafted quote for this client to the workspace (by name, the
  // only key available before conversion — kept for backfill).
  await sb()
    .from("finance_docs")
    .update({ workspace_id: wsId })
    .eq("kind", "QUOTE")
    .is("workspace_id", null)
    .eq("client_name", lead.company)

  await sb().from("leads").update({ stage: "WON", workspace_id: wsId }).eq("id", id)
  await audit("lead.convert", "Lead", id, user.id)

  return Response.json(
    { workspaceId: wsId, slug, projectId, shortCode, reused: !!existing, repo },
    { status: 201 }
  )
}
