import { getT } from "@/lib/i18n-server"
import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/auth/session"
import { getPreferences } from "@/lib/data"
import { AppearanceForm } from "@/components/profile/appearance-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function SettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const preferences = await getPreferences(user.id)

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Settings")}</h1>
        <p className="text-muted-foreground text-sm">
          Appearance and notification preferences ({user.role.toLowerCase()}).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Appearance &amp; preferences</CardTitle>
          <CardDescription>
            Theme, density, language and accent — saved to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceForm preferences={preferences} />
        </CardContent>
      </Card>
    </div>
  )
}
