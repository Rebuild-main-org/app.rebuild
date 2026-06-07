import { notFound } from "next/navigation"

import { getWorkspace, membersForWorkspace } from "@/lib/queries"
import { AddMemberDialog } from "@/components/workspaces/add-member-dialog"
import { WorkspaceSettingsForm } from "@/components/workspaces/settings-form"
import { AgentSelector } from "@/components/workspace/agent-selector"
import { RoleBadge, UserAvatar } from "@/components/shared/badges"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()
  const members = await membersForWorkspace(id)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Workspace settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Name, repo and lifecycle status.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceSettingsForm workspace={ws} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Agent</CardTitle>
          <CardDescription>
            Pick an agent from the library. Its files (soul, skills, UI, languages, rules,
            knowledge…) are injected when rebuild216 connects to this workspace&apos;s projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentSelector workspaceId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                Engineers and leads with access to this workspace.
              </CardDescription>
            </div>
            <AddMemberDialog workspaceId={id} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <UserAvatar name={m.user.name} src={m.user.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.user.name}</div>
                <div className="text-muted-foreground text-xs">
                  {m.user.email}
                </div>
              </div>
              <RoleBadge role={m.role} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
