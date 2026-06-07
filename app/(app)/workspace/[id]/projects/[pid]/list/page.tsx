import { getUsersMap } from "@/lib/data"
import { ticketsForProject } from "@/lib/queries"
import { STATUS_LABELS } from "@/lib/types"
import {
  PriorityBadge,
  StatusBadge,
  TypeIcon,
  UserAvatar,
} from "@/components/shared/badges"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function ListPage({
  params,
}: {
  params: Promise<{ pid: string }>
}) {
  const { pid } = await params
  const [rawTickets, users] = await Promise.all([
    ticketsForProject(pid),
    getUsersMap(),
  ])
  const tickets = rawTickets.sort((a, b) => a.shortId.localeCompare(b.shortId))

  return (
    <div className="p-4 md:p-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-28">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => {
              const assignee = t.assigneeId ? users.get(t.assigneeId) : undefined
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <TypeIcon type={t.type} />
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {t.shortId}
                  </TableCell>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={t.priority} />
                  </TableCell>
                  <TableCell>
                    {assignee ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar name={assignee.name} />
                        <span className="text-sm">{assignee.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {t.points ?? "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        {tickets.length} tickets ·{" "}
        {tickets.filter((t) => t.status === "DONE").length} done ·{" "}
        {Object.values(STATUS_LABELS).length} statuses
      </p>
    </div>
  )
}
