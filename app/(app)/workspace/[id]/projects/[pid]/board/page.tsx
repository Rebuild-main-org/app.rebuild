import { getSessionUser } from "@/lib/auth/session"
import { isAdmin } from "@/lib/auth"
import { membersForWorkspace, ticketsForProject } from "@/lib/queries"
import { KanbanBoard } from "@/components/board/kanban-board"

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  const [tickets, members, user] = await Promise.all([
    ticketsForProject(pid),
    membersForWorkspace(id),
    getSessionUser(),
  ])
  const users = members.map((m) => ({ id: m.user.id, name: m.user.name }))
  const canDelete = isAdmin(user!.role) || user!.role === "LEAD"

  return (
    <KanbanBoard
      projectId={pid}
      initialTickets={tickets}
      users={users}
      canDelete={canDelete}
      currentUserId={user!.id}
    />
  )
}
