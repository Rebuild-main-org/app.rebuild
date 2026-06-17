import { getT } from "@/lib/i18n-server"
import { redirect } from "next/navigation"
import { Download } from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { getPreferences, sb } from "@/lib/data"
import { ProfileForm } from "@/components/profile/profile-form"
import { MfaSetup } from "@/components/profile/mfa-setup"
import { AvatarUpload } from "@/components/profile/avatar-upload"
import { ClaudeConnect } from "@/components/profile/claude-connect"
import { GithubConnect } from "@/components/profile/github-connect"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const preferences = await getPreferences(user.id)
  const { data: prof } = await sb().from("users").select("github_id").eq("id", user.id).maybeSingle()
  const githubUsername = (prof?.github_id as string | null) ?? ""

  const { t } = await getT()
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("Profile")}</h1>
        <p className="text-muted-foreground text-sm">
          Your identity across the platform.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>Visible to your team.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AvatarUpload name={user.name} initialUrl={user.avatarUrl} />
          <ProfileForm user={user} preferences={preferences} githubUsername={githubUsername} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claude (IA)</CardTitle>
          <CardDescription>
            Connecte ton compte Anthropic : l&apos;IA serveur (Copilot, revue, scaffold…) tournera sur
            ta clé plutôt que sur la clé partagée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaudeConnect />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub</CardTitle>
          <CardDescription>
            Connecte ton compte GitHub : on demande automatiquement ton accès à l&apos;organisation
            pour que tu puisses contribuer aux dépôts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GithubConnect />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Protect your account with a second factor (authenticator app).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaSetup />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>
            Download a copy of all data tied to your account (GDPR right of access).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/profile/export"
            className="bg-secondary hover:bg-secondary/80 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Download className="size-4" /> Download my data
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
