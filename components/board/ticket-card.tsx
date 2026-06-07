"use client"

import type { Ticket, User } from "@/lib/types"
import { PriorityBadge, TypeIcon, UserAvatar } from "@/components/shared/badges"
import { Badge } from "@/components/ui/badge"

export function TicketCard({
  ticket,
  assignee,
  onClick,
  onDragStart,
  selected = false,
}: {
  ticket: Ticket
  assignee?: Pick<User, "name">
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  selected?: boolean
}) {
  const overdue =
    ticket.dueDate &&
    ticket.status !== "DONE" &&
    new Date(ticket.dueDate) < new Date()

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={
        "bg-card hover:border-primary/40 cursor-pointer rounded-md border p-3 shadow-sm transition-colors" +
        (selected ? " ring-primary border-primary ring-2" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm leading-snug font-medium">{ticket.title}</span>
        <TypeIcon type={ticket.type} className="mt-0.5" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ticket.labels.map((l) => (
          <Badge key={l} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
            {l}
          </Badge>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-[11px]">
            {ticket.shortId}
          </span>
          <PriorityBadge priority={ticket.priority} />
          {ticket.points != null && (
            <span className="text-muted-foreground text-[11px]">
              {ticket.points} pts
            </span>
          )}
        </div>
        {assignee && <UserAvatar name={assignee.name} />}
      </div>
      {overdue && (
        <div className="mt-2 text-[11px] font-medium text-red-500">
          Due {new Date(ticket.dueDate!).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}
