"use client"

import { initials } from "@/components/shared/badges"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface PresenceUser {
  userId: string
  name: string
  avatarUrl?: string
}

// Live avatars of who else is viewing this room (board, IDE, …).
export function PresenceBar({
  users,
  selfId,
  className,
}: {
  users: PresenceUser[]
  selfId?: string
  className?: string
}) {
  if (users.length === 0) return null
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <div className="flex -space-x-2">
        {users.slice(0, 5).map((u) => (
          <Tooltip key={u.userId}>
            <TooltipTrigger asChild>
              <Avatar className="ring-background size-6 ring-2">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
                <AvatarFallback className="text-[10px]">
                  {initials(u.name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              {u.name}
              {u.userId === selfId && " (you)"}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {users.length > 5 && (
        <span className="text-muted-foreground text-xs">
          +{users.length - 5}
        </span>
      )}
    </div>
  )
}
