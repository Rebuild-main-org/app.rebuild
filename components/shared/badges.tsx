import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  PRIORITY_META,
  PROJECT_STATUS_META,
  STATUS_LABELS,
  TYPE_META,
  type ProjectStatus,
  type Role,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from "@/lib/types"

export function TypeIcon({
  type,
  className,
}: {
  type: TicketType
  className?: string
}) {
  const meta = TYPE_META[type]
  return (
    <span
      title={meta.label}
      className={cn("inline-flex w-4 justify-center font-bold", meta.color, className)}
    >
      {meta.icon}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        meta.color
      )}
    >
      {meta.label}
    </span>
  )
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="outline" className="font-normal">
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const meta = PROJECT_STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.color
      )}
    >
      {meta.label}
    </span>
  )
}

const ROLE_COLOR: Record<Role, string> = {
  SUPER_ADMIN: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  ADMIN: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  LEAD: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  PM: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  ENGINEER: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  QA: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  DESIGNER: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  SALES: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  FINANCE: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  SUPPORT: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  CLIENT: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        ROLE_COLOR[role]
      )}
    >
      {role}
    </span>
  )
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

export function UserAvatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string
  src?: string
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <Avatar className={cn(size === "sm" ? "size-6" : "size-8", className)}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
