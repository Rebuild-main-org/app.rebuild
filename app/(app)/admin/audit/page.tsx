import { redirect } from "next/navigation"
import { ScrollText } from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { SEL, getUsersMap, sb } from "@/lib/data"
import type { AuditLog } from "@/lib/types"
import { AuditLogView, type AuditRow } from "@/components/admin/audit-log-view"

export const dynamic = "force-dynamic"

export default async function AuditPage() {
  const user = await getSessionUser()
  if (!user || !can(user, "admin.panel")) redirect("/dashboard")

  const [{ data }, users] = await Promise.all([
    sb()
      .from("audit_logs")
      .select(SEL.auditLog)
      .order("created_at", { ascending: false })
      .limit(1000),
    getUsersMap(),
  ])
  const logs = (data ?? []) as AuditLog[]

  const rows: AuditRow[] = logs.map((l) => {
    const u = users.get(l.userId)
    return {
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      userId: l.userId,
      userName: u?.name ?? `${l.userId.slice(0, 8)}…`,
      userAvatar: u?.avatarUrl ?? null,
      meta: l.meta ?? null,
      createdAt: l.createdAt,
    }
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ScrollText className="size-5" /> Audit log
        </h1>
        <p className="text-muted-foreground text-sm">
          Every recorded action across the platform — search, filter and export.
        </p>
      </div>

      <AuditLogView rows={rows} />
    </div>
  )
}
