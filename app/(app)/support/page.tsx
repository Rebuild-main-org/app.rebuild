import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { SupportView, type SupportRow } from "@/components/support/support-view"

export const dynamic = "force-dynamic"

export default async function SupportPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/support")

  const isStaff = can(user, "support.view")
  let q = sb().from("support_tickets").select(SEL.supportTicket).order("created_at", { ascending: false })
  // Non-staff see only their own tickets.
  if (!isStaff) q = q.or(`requester_id.eq.${user.id},requester_email.ilike.${user.email}`)

  const [{ data }, users] = await Promise.all([q, getUsersMap()])
  const rows: SupportRow[] = ((data ?? []) as SupportRow[]).map((t) => ({
    ...t,
    assignee: users.get((t as unknown as { assigneeId?: string }).assigneeId ?? "")?.name,
  }))

  return <SupportView initial={rows} canResolve={can(user, "support.resolve")} isStaff={isStaff} />
}
