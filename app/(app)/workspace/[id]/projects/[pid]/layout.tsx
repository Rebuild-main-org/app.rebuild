import { notFound } from "next/navigation"

import { getProject, getWorkspace } from "@/lib/queries"
import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { ProjectStatusControl } from "@/components/projects/project-status-control"
import { ProjectTabs } from "@/components/projects/project-tabs"

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string; pid: string }>
  children: React.ReactNode
}) {
  const { id, pid } = await params
  const [ws, project, user] = await Promise.all([getWorkspace(id), getProject(pid), getSessionUser()])
  if (!ws || !project || project.workspaceId !== id) notFound()
  const canEdit = !!user && can(user, "project.update")

  const base = `/workspace/${id}/projects/${pid}`

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-3 md:px-6">
        <div>
          <div className="text-muted-foreground text-xs">{ws.name}</div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {project.name}
            <ProjectStatusControl projectId={project.id} status={project.status} canEdit={canEdit} />
          </h1>
        </div>
      </div>
      <ProjectTabs base={base} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
