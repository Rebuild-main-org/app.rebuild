import "server-only"

import { sb } from "@/lib/data"
import type { Availability, DiscordMember, ProfileVisibility, Role } from "@/lib/types"

const ONLINE_MS = 2 * 60_000

export interface Suggestion {
  member: DiscordMember
  reason: string
}

// The community directory for a given viewer: every member they're allowed to
// see (respecting block + profile visibility), plus smart suggestions.
export async function discordDirectory(meId: string): Promise<{
  members: DiscordMember[]
  suggestions: Suggestion[]
}> {
  const [{ data: users }, { data: prefs }, { data: blocks }, { data: wsMembers }] = await Promise.all([
    sb().from("users").select("id,name,email,role,avatarUrl:avatar_url,lastSeenAt:last_seen_at").order("name"),
    sb().from("user_preferences").select("user_id,title,bio,availability,skills,tags,open_to_talk,visibility"),
    sb().from("user_blocks").select("blocker_id,target_id").eq("kind", "BLOCK"),
    sb().from("workspace_members").select("user_id,workspace_id"),
  ])

  const prefMap = new Map((prefs ?? []).map((p) => [p.user_id as string, p]))
  // Blocks in either direction hide the pair from each other.
  const hidden = new Set<string>()
  for (const b of blocks ?? []) {
    if (b.blocker_id === meId) hidden.add(b.target_id as string)
    if (b.target_id === meId) hidden.add(b.blocker_id as string)
  }
  // Workspace membership map for "team" visibility + matching.
  const wsByUser = new Map<string, Set<string>>()
  for (const m of wsMembers ?? []) {
    const set = wsByUser.get(m.user_id as string) ?? new Set<string>()
    set.add(m.workspace_id as string)
    wsByUser.set(m.user_id as string, set)
  }
  const myWs = wsByUser.get(meId) ?? new Set<string>()
  const now = Date.now()

  const members: DiscordMember[] = []
  for (const u of (users ?? []) as Array<Record<string, unknown>>) {
    const id = u.id as string
    if (id === meId || hidden.has(id)) continue
    const p = prefMap.get(id)
    const visibility = ((p?.visibility as ProfileVisibility) ?? "everyone") as ProfileVisibility
    if (visibility === "nobody") continue
    if (visibility === "team") {
      const theirWs = wsByUser.get(id) ?? new Set<string>()
      const shares = [...theirWs].some((w) => myWs.has(w))
      if (!shares) continue
    }
    const availability = ((p?.availability as Availability) ?? "AVAILABLE") as Availability
    const recent = u.lastSeenAt ? now - new Date(u.lastSeenAt as string).getTime() < ONLINE_MS : false
    members.push({
      id,
      name: u.name as string,
      email: u.email as string,
      role: u.role as Role,
      avatarUrl: (u.avatarUrl as string) ?? undefined,
      title: (p?.title as string) ?? undefined,
      bio: (p?.bio as string) ?? undefined,
      skills: (p?.skills as string[]) ?? [],
      tags: (p?.tags as string[]) ?? [],
      availability,
      openToTalk: (p?.open_to_talk as boolean) ?? false,
      online: recent && availability !== "INVISIBLE",
    })
  }

  // Matching: shared skills/tags (×2 each) + shared workspaces (×3) + open-to-talk.
  const mine = prefMap.get(meId)
  const mySkills = new Set(((mine?.skills as string[]) ?? []).map((s) => s.toLowerCase()))
  const myTags = new Set(((mine?.tags as string[]) ?? []).map((s) => s.toLowerCase()))
  const scored = members
    .map((m) => {
      const sharedSkills = m.skills.filter((s) => mySkills.has(s.toLowerCase()))
      const sharedTags = m.tags.filter((t) => myTags.has(t.toLowerCase()))
      const theirWs = wsByUser.get(m.id) ?? new Set<string>()
      const sharedWs = [...theirWs].filter((w) => myWs.has(w)).length
      const score = sharedSkills.length * 2 + sharedTags.length * 2 + sharedWs * 3 + (m.openToTalk ? 1 : 0)
      let reason = ""
      if (sharedSkills.length || sharedTags.length) reason = `Shares ${[...sharedSkills, ...sharedTags.map((t) => `#${t}`)].slice(0, 3).join(", ")}`
      else if (sharedWs) reason = "On a shared workspace"
      else if (m.openToTalk) reason = "Open to talk"
      return { member: m, score, reason }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  return { members, suggestions: scored.map(({ member, reason }) => ({ member, reason })) }
}
