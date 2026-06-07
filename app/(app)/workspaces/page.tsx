import { getT } from "@/lib/i18n-server"
import Link from "next/link"
import { FolderGit2, Users } from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import {
  membersForWorkspace,
  projectsForWorkspace,
  ticketsForWorkspace,
  workspacesForUser,
} from "@/lib/queries"
import { CreateWorkspaceDialog } from "@/components/workspaces/create-workspace-dialog"
import { DeleteWorkspaceButton } from "@/components/workspaces/delete-workspace-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function WorkspacesPage() {
  const user = (await getSessionUser())!
  const workspaces = await workspacesForUser(user.id, user.role)
  const cards = await Promise.all(
    workspaces.map(async (ws) => {
      const [projects, members, tickets] = await Promise.all([
        projectsForWorkspace(ws.id),
        membersForWorkspace(ws.id),
        ticketsForWorkspace(ws.id),
      ])
      return {
        ws,
        projectCount: projects.length,
        memberCount: members.length,
        openTickets: tickets.filter((t) => t.status !== "DONE").length,
      }
    })
  )

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("Workspaces")}</h1>
          <p className="text-muted-foreground text-sm">
            Each workspace is one client&apos;s isolated space.
          </p>
        </div>
        {isAdmin(user.role) && <CreateWorkspaceDialog />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ ws, projectCount, memberCount, openTickets }) => {
          return (
            <Link key={ws.id} href={`/workspace/${ws.id}/overview`}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle>{ws.name}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={ws.status === "ACTIVE" ? "default" : "secondary"}
                      >
                        {ws.status}
                      </Badge>
                      {isAdmin(user.role) && (
                        <DeleteWorkspaceButton id={ws.id} name={ws.name} />
                      )}
                    </div>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <FolderGit2 className="size-3.5" /> {ws.githubRepo}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ws.technologies.map((t) => (
                      <Badge key={t} variant="outline" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-4 text-xs">
                    <span>{projectCount} projects</span>
                    <span>{openTickets} open tickets</span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" /> {memberCount}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
