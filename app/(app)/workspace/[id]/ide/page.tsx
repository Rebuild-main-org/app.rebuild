import { notFound } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import {
  branchesForWorkspace,
  getWorkspace,
  repoFiles,
  ticketsForWorkspace,
} from "@/lib/queries"
import { IdeWorkspace } from "@/components/ide/ide-workspace"
import { githubEnabled } from "@/lib/github"

export default async function IdePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()

  const [files, branches, tickets, user] = await Promise.all([
    repoFiles(id),
    branchesForWorkspace(id),
    ticketsForWorkspace(id),
    getSessionUser(),
  ])

  // Surface an active ticket so the IDE can suggest a branch name / commit ref.
  const activeTicket = tickets.find((t) => t.status === "IN_PROGRESS")?.shortId

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div>
          <h1 className="text-lg font-semibold">IDE</h1>
          <p className="text-muted-foreground text-xs">{ws.githubRepo}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <IdeWorkspace
          workspaceId={id}
          repo={files}
          branches={branches}
          activeTicket={activeTicket}
          currentUserId={user!.id}
          githubMode={githubEnabled()}
        />
      </div>
    </div>
  )
}
