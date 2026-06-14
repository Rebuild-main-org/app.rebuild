import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { fetchSupportTickets, getUsersMap } from "@/lib/data"
import { SupportView, type SupportRow } from "@/components/support/support-view"

export const dynamic = "force-dynamic"

export default async function SupportPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/support")

  const isStaff = can(user, "support.view")
  const [data, users] = await Promise.all([
    fetchSupportTickets({ isStaff, ownerId: user.id, ownerEmail: user.email }),
    getUsersMap(),
  ])
  const rows: SupportRow[] = (data as unknown as SupportRow[]).map((t) => ({
    ...t,
    assignee: users.get((t as unknown as { assigneeId?: string }).assigneeId ?? "")?.name,
  }))

  return <SupportView initial={rows} canResolve={can(user, "support.resolve")} isStaff={isStaff} />
}
