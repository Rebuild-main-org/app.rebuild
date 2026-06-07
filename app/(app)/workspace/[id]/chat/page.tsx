import { notFound } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { getWorkspace } from "@/lib/queries"
import { TeamChat } from "@/components/chat/team-chat"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ws = await getWorkspace(id)
  if (!ws) notFound()
  const user = (await getSessionUser())!

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-4 md:px-6">
        <h1 className="text-xl font-semibold">Team chat</h1>
        <p className="text-muted-foreground text-sm">
          Project discussion for {ws.name}
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <TeamChat workspaceId={id} currentUserId={user.id} />
      </div>
    </div>
  )
}
