import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { getPreferences } from "@/lib/data"
import { discordDirectory } from "@/lib/discord"
import { DiscordView } from "@/components/discord/discord-view"

export const dynamic = "force-dynamic"

export default async function DiscordPage() {
  const me = await getSessionUser()
  if (!me) redirect("/login?next=/discord")

  const [{ members, suggestions }, myPrefs] = await Promise.all([
    discordDirectory(me.id),
    getPreferences(me.id),
  ])

  return (
    <DiscordView
      members={members}
      suggestions={suggestions}
      meId={me.id}
      myPrefs={myPrefs}
      isSuperAdmin={me.role === "SUPER_ADMIN"}
    />
  )
}
