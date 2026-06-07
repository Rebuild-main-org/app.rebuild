import { getT } from "@/lib/i18n-server"
import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { can } from "@/lib/auth"
import { canAccessSection } from "@/lib/permissions"
import { SEL, sb } from "@/lib/data"
import { PipelineBoard } from "@/components/crm/pipeline-board"
import type { Lead, User } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function CrmPage() {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "crm"))) redirect("/dashboard")

  const [{ data }, { data: userRows }] = await Promise.all([
    sb().from("leads").select(SEL.lead).order("created_at", { ascending: false }),
    sb().from("users").select(SEL.user),
  ])
  const leads = (data ?? []) as Lead[]
  // Candidate delivery leads (everyone who isn't a client), for the convert step.
  const deliveryLeads = ((userRows ?? []) as User[])
    .filter((u) => u.role !== "CLIENT")
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("CRM — Pipeline")}</h1>
        <p className="text-muted-foreground text-sm">
          Pre-sales pipeline. Drag leads across stages; convert won deals into a
          workspace.
        </p>
      </div>
      <PipelineBoard
        initialLeads={leads}
        canManage={can(user, "crm.manage")}
        deliveryLeads={deliveryLeads}
      />
    </div>
  )
}
