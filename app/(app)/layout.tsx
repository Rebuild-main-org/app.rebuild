import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import { AppShell } from "@/components/layout/app-shell"
import { I18nProvider } from "@/components/i18n-provider"
import { PreferencesApplier } from "@/components/profile/preferences-applier"
import { getSessionUser, resolveAppUser } from "@/lib/auth/session"
import { getPreferences } from "@/lib/data"
import { sectionsAllowedFor } from "@/lib/permissions"
import { notificationsForUser, workspacesForUser } from "@/lib/queries"
import type { Lang } from "@/lib/i18n"
import type { Notification } from "@/lib/types"

// Authenticated app shell. Every segment under here requires a real session.
export const dynamic = "force-dynamic"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionUser()
  if (!session) redirect("/login")

  const user = await resolveAppUser(session)
  const [workspaces, notifications, preferences, allowedSections] = await Promise.all([
    workspacesForUser(user.id, user.role),
    notificationsForUser(user.id) as Promise<Notification[]>,
    getPreferences(user.id),
    sectionsAllowedFor(user.role),
  ])
  // Honor the saved language preference (DB) as the source of truth; the cookie
  // is only a fast-path the Settings form sets for an instant switch. Without
  // this, a saved "fr" preference defaulted to "en" on any device lacking the cookie.
  const lang =
    (preferences.language as Lang) ||
    (((await cookies()).get("rebuild_lang")?.value) as Lang) ||
    "en"

  return (
    <I18nProvider lang={lang}>
      <PreferencesApplier theme={preferences.theme} density={preferences.density} accent={preferences.accent} />
      <AppShell
        user={user}
        workspaces={workspaces}
        notifications={notifications}
        allowedSections={allowedSections}
      >
        {children}
      </AppShell>
    </I18nProvider>
  )
}
