import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { projectsForWorkspace, workspacesForUser } from "@/lib/queries"
import { Rebuild216Guide } from "@/components/cli/rebuild216-guide"

export const dynamic = "force-dynamic"

export default async function Rebuild216Page() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/rebuild216")

  // The projects the user can reach (for ready-to-paste commands).
  const workspaces = await workspacesForUser(user.id, user.role)
  const lists = await Promise.all(workspaces.map((w) => projectsForWorkspace(w.id)))
  const projects = [...new Set(lists.flat().map((p) => p.name))].sort().slice(0, 12)

  return <Rebuild216Guide projects={projects} />
}
