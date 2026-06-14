// Supabase data access. Column aliases map snake_case DB columns to the
// camelCase TS types, so query results match the models in lib/types.ts.
// Server-only: uses the service-role client (bypasses RLS; authorization is
// enforced in route handlers via lib/auth).

import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { Role, User, UserPreferences } from "@/lib/types"

export const sb = supabaseAdmin

// --- select column maps (camelCase aliases) ---------------------------------

export const SEL = {
  workspace:
    "id,name,slug,githubRepo:github_repo,status,clientName:client_name,clientEmail:client_email,startDate:start_date,technologies",
  project:
    "id,name,shortCode:short_code,status,workspaceId:workspace_id,description,startDate:start_date,endDate:end_date",
  projectGroup: "id,workspaceId:workspace_id,name,position,createdAt:created_at",
  ticket:
    'id,shortId:short_id,title,description,type,priority,status,projectId:project_id,assigneeId:assignee_id,reporterId:reporter_id,labels,epicId:epic_id,parentId:parent_id,milestoneId:milestone_id,sprintId:sprint_id,points,dueDate:due_date,commitRef:commit_ref,branch,createdAt:created_at,updatedAt:updated_at,order',
  ticketLink:
    "id,fromTicketId:from_ticket_id,toTicketId:to_ticket_id,type,createdAt:created_at",
  attachment:
    "id,ticketId:ticket_id,name,mimeType:mime_type,size,uploadedById:uploaded_by_id,createdAt:created_at",
  member: "id,userId:user_id,workspaceId:workspace_id,role,joinedAt:joined_at",
  user: "id,name,email,role,avatarUrl:avatar_url",
  milestone:
    "id,title,description,dueDate:due_date,projectId:project_id,done,validatedByClient:validated_by_client,clientFeedback:client_feedback,validatedAt:validated_at",
  sprint:
    "id,name,goal,startDate:start_date,endDate:end_date,projectId:project_id,status",
  comment:
    "id,content,ticketId:ticket_id,authorId:author_id,createdAt:created_at,updatedAt:updated_at",
  activity: "id,ticketId:ticket_id,kind,actorId:actor_id,message,createdAt:created_at",
  commit:
    "id,hash,message,authorId:author_id,date,workspaceId:workspace_id,ticketId:ticket_id,branch",
  pr: "id,number,title,status,ci,branchFrom:branch_from,branchTo:branch_to,workspaceId:workspace_id,ticketId:ticket_id,authorId:author_id,createdAt:created_at",
  prReview: "id,prId:pr_id,reviewerId:reviewer_id,state,body,createdAt:created_at",
  prComment: "id,prId:pr_id,authorId:author_id,path,line,body,createdAt:created_at",
  deployment:
    "id,env,commitHash:commit_hash,status,deployedAt:deployed_at,workspaceId:workspace_id,branch,authorId:author_id",
  branch:
    "id,workspaceId:workspace_id,name,ahead,behind,protected,lastCommitHash:last_commit_hash,lastCommitDate:last_commit_date,lastAuthorId:last_author_id",
  repoFile:
    "id,workspaceId:workspace_id,path,content,originalContent:original_content,status",
  notification:
    "id,type,content,userId:user_id,read,linkUrl:link_url,createdAt:created_at",
  message:
    "id,content,authorId:author_id,workspaceId:workspace_id,isFromClient:is_from_client,createdAt:created_at",
  financeDoc:
    "id,kind,number,workspaceId:workspace_id,clientName:client_name,issueDate:issue_date,dueDate:due_date,status,items,taxRate:tax_rate,currency,notes",
  transaction: "id,kind,label,category,amount,date,workspaceId:workspace_id",
  document:
    "id,name,mimeType:mime_type,size,workspaceId:workspace_id,projectId:project_id,uploadedById:uploaded_by_id,createdAt:created_at",
  meeting:
    "id,title,start:start_at,end:end_at,workspaceId:workspace_id,meetLink:meet_link,attendeeIds:attendee_ids,createdById:created_by_id",
  lead:
    "id,company,contactName:contact_name,contactEmail:contact_email,stage,value,currency,source,ownerId:owner_id,notes,workspaceId:workspace_id,createdAt:created_at,updatedAt:updated_at",
  timeEntry:
    "id,ticketId:ticket_id,userId:user_id,minutes,note,spentOn:spent_on,createdAt:created_at",
  testCase:
    "id,projectId:project_id,title,steps,expected,createdById:created_by_id,createdAt:created_at",
  testRun:
    "id,testCaseId:test_case_id,status,notes,runById:run_by_id,ticketId:ticket_id,createdAt:created_at",
  supportTicket:
    "id,subject,body,requesterEmail:requester_email,requesterId:requester_id,status,priority,workspaceId:workspace_id,assigneeId:assignee_id,resolvedById:resolved_by_id,resolvedAt:resolved_at,slaDueAt:sla_due_at,createdAt:created_at,updatedAt:updated_at",
  // Adds the github_issue_* columns (support-github-issue.sql). Callers should
  // fall back to `supportTicket` so the page still works before the migration.
  supportTicketFull:
    "id,subject,body,requesterEmail:requester_email,requesterId:requester_id,status,priority,workspaceId:workspace_id,assigneeId:assignee_id,resolvedById:resolved_by_id,resolvedAt:resolved_at,slaDueAt:sla_due_at,githubIssueNumber:github_issue_number,githubIssueUrl:github_issue_url,createdAt:created_at,updatedAt:updated_at",
  sprintSnapshot:
    "id,sprintId:sprint_id,day,remainingPoints:remaining_points,donePoints:done_points,capturedAt:captured_at",
  auditLog:
    "id,action,entityType:entity_type,entityId:entity_id,userId:user_id,meta,createdAt:created_at",
  aiFeedback:
    "id,traceId:trace_id,userId:user_id,workspaceId:workspace_id,feature,score,note,createdAt:created_at",
  customField:
    "id,projectId:project_id,name,type,options,createdAt:created_at",
} as const

// --- users --------------------------------------------------------------------

// Display directory of all app users (seeded + synced auth users), used to
// resolve assignee / author / member names.
export async function getUsersMap(): Promise<Map<string, User>> {
  const { data } = await sb().from("users").select(SEL.user)
  const map = new Map<string, User>()
  for (const u of (data ?? []) as User[]) map.set(u.id, u)
  return map
}

// Fetch support tickets including the github_issue_* columns when they exist,
// degrading to the base projection if the support-github-issue.sql migration
// hasn't been applied yet — so the support page never breaks on deploy order.
export async function fetchSupportTickets(opts: {
  isStaff: boolean
  ownerId: string
  ownerEmail: string
  status?: string | null
}): Promise<Record<string, unknown>[]> {
  const build = (select: string) => {
    let q = sb().from("support_tickets").select(select).order("created_at", { ascending: false })
    if (opts.status) q = q.eq("status", opts.status)
    if (!opts.isStaff) q = q.or(`requester_id.eq.${opts.ownerId},requester_email.ilike.${opts.ownerEmail}`)
    return q
  }
  const full = await build(SEL.supportTicketFull)
  if (!full.error) return (full.data ?? []) as unknown as Record<string, unknown>[]
  const base = await build(SEL.supportTicket)
  return (base.data ?? []) as unknown as Record<string, unknown>[]
}

export async function userById(id?: string | null): Promise<User | undefined> {
  if (!id) return undefined
  const { data } = await sb().from("users").select(SEL.user).eq("id", id).maybeSingle()
  return (data as User | null) ?? undefined
}

// Ensure a row in the `users` directory mirrors the signed-in profile, so that
// data this user creates resolves to a name. Keyed by the auth user id.
// --- preferences --------------------------------------------------------------

const DEFAULT_PREFS = (userId: string): UserPreferences => ({
  userId,
  theme: "system",
  density: "comfortable",
  language: "en",
  accent: "#0a0a0a",
  emailDigest: true,
  availability: "AVAILABLE",
  skills: [],
  tags: [],
  openToTalk: false,
  dnd: false,
  visibility: "everyone",
})

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const { data } = await sb()
    .from("user_preferences")
    .select(
      "userId:user_id,theme,density,language,accent,emailDigest:email_digest,title,bio,availability,skills,tags,openToTalk:open_to_talk,dnd,visibility"
    )
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) return DEFAULT_PREFS(userId)
  // Backfill defaults for the Discord fields (older rows / before migration).
  return {
    ...DEFAULT_PREFS(userId),
    ...(data as Partial<UserPreferences>),
    skills: (data as UserPreferences).skills ?? [],
    tags: (data as UserPreferences).tags ?? [],
    availability: (data as UserPreferences).availability ?? "AVAILABLE",
    openToTalk: (data as UserPreferences).openToTalk ?? false,
    dnd: (data as UserPreferences).dnd ?? false,
    visibility: (data as UserPreferences).visibility ?? "everyone",
  }
}

export async function savePreferences(
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getPreferences(userId)
  const next = { ...current, ...patch, userId }
  await sb().from("user_preferences").upsert(
    {
      user_id: userId,
      theme: next.theme,
      density: next.density,
      language: next.language,
      accent: next.accent,
      email_digest: next.emailDigest,
      title: next.title ?? null,
      bio: next.bio ?? null,
      availability: next.availability,
      skills: next.skills,
      tags: next.tags,
      open_to_talk: next.openToTalk,
      dnd: next.dnd,
      visibility: next.visibility,
    },
    { onConflict: "user_id" }
  )
  return next
}

export async function syncUserDirectory(u: {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
  githubUsername?: string
}): Promise<void> {
  await sb()
    .from("users")
    .upsert(
      {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        avatar_url: u.avatarUrl ?? null,
      },
      { onConflict: "id" }
    )
  // Auto-link the GitHub login from OAuth sign-in, but only when it isn't
  // already set — never clobber a username the user entered on their profile.
  if (u.githubUsername) {
    await sb()
      .from("users")
      .update({ github_id: u.githubUsername })
      .eq("id", u.id)
      .is("github_id", null)
  }
  // Fix A: reconcile any invitation placeholder (a `users` row created by the
  // invite flow with a random id) that shares this email but a different id —
  // re-point its memberships to the real Auth id, then remove the placeholder.
  await reconcileInvitedUser(u.id, u.email)
}

// Merge a pre-auth placeholder directory row into the real Auth user. Invitations
// create a users row keyed by a random id; when that person signs up their Auth
// uuid differs, so their workspace memberships must be re-pointed.
async function reconcileInvitedUser(authId: string, email: string): Promise<void> {
  if (!email) return
  const { data: dupes } = await sb()
    .from("users")
    .select("id")
    .ilike("email", email)
    .neq("id", authId)
  for (const dupe of dupes ?? []) {
    const oldId = dupe.id as string
    const { data: members } = await sb()
      .from("workspace_members")
      .select("id,workspace_id")
      .eq("user_id", oldId)
    for (const m of members ?? []) {
      const { data: already } = await sb()
        .from("workspace_members")
        .select("id")
        .eq("user_id", authId)
        .eq("workspace_id", m.workspace_id as string)
        .maybeSingle()
      if (already) await sb().from("workspace_members").delete().eq("id", m.id as string)
      else await sb().from("workspace_members").update({ user_id: authId }).eq("id", m.id as string)
    }
    // Best-effort: re-point other references a placeholder might own.
    await sb().from("leads").update({ owner_id: authId }).eq("owner_id", oldId)
    await sb().from("users").delete().eq("id", oldId)
  }
}
