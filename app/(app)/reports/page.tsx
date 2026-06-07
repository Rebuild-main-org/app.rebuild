import { getT } from "@/lib/i18n-server"
import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { canAccessSection } from "@/lib/permissions"
import { workspacesForUser } from "@/lib/queries"
import { ReportViewer } from "@/components/reports/report-viewer"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ReportsPage() {
  const user = await getSessionUser()
  if (!user || !(await canAccessSection(user.role, "reports"))) redirect("/dashboard")
  const workspaces = (await workspacesForUser(user.id, user.role)).map((w) => ({
    id: w.id,
    name: w.name,
  }))

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Reports")}</h1>
        <p className="text-muted-foreground text-sm">
          Auto-generated weekly, sprint and release reports.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Generate a report</CardTitle>
          <CardDescription>
            In production these are emailed automatically (weekly on Friday,
            per sprint, and on each production release). Generate one on demand
            here and export it as Markdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportViewer workspaces={workspaces} />
        </CardContent>
      </Card>
    </div>
  )
}
