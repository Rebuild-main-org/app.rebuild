import { getT } from "@/lib/i18n-server"
import { notFound } from "next/navigation"

import {
  getWorkspace,
  groupsForWorkspace,
  projectGroupMap,
  projectProgress,
  projectsForWorkspace,
  ticketsForProject,
} from "@/lib/queries"
import { getSessionUser } from "@/lib/auth/session"
import { can, isAdmin } from "@/lib/auth"
import { CreateProjectDialog } from "@/components/projects/create-project-dialog"
import { ProjectsBoard, type BoardCard } from "@/components/projects/projects-board"
import { Reveal } from "@/components/motion/reveal"

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()
  const [projects, groups, groupMap] = await Promise.all([
    projectsForWorkspace(id),
    groupsForWorkspace(id),
    projectGroupMap(id),
  ])
  const cards: BoardCard[] = await Promise.all(
    projects.map(async (p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      description: p.description,
      groupId: groupMap[p.id] ?? null,
      ticketCount: (await ticketsForProject(p.id)).length,
      progress: await projectProgress(p.id),
    }))
  )
  const user = (await getSessionUser())!
  const canManage = isAdmin(user.role) || user.role === "LEAD"
  const canDelete = can(user, "project.delete")

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("Projects")}</h1>
          <p className="text-muted-foreground text-sm">{ws.name}</p>
        </div>
        {canManage && <CreateProjectDialog workspaceId={id} />}
      </div>

      <Reveal>
        <ProjectsBoard
          workspaceId={id}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          cards={cards}
          canManage={canManage}
          canDelete={canDelete}
        />
      </Reveal>
    </div>
  )
}
