import { sprintsForProject, ticketsForProject } from "@/lib/queries"
import { Backlog } from "@/components/board/backlog"

export default async function BacklogPage({
  params,
}: {
  params: Promise<{ pid: string }>
}) {
  const { pid } = await params
  const [tickets, sprints] = await Promise.all([
    ticketsForProject(pid),
    sprintsForProject(pid),
  ])
  return <Backlog initialTickets={tickets} sprints={sprints} />
}
