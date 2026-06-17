"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, X, Clock } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

// GitHub mark (lucide-react dropped its brand icons; inline for a crisp logo).
function Github({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

interface GithubState {
  connected: boolean
  login: string | null
  orgMember: boolean
  org: string
  oauthEnabled: boolean
}

export function GithubConnect() {
  const [state, setState] = useState<GithubState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/profile/github")
      if (r.ok) setState(await r.json())
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Surface the OAuth round-trip result (?github=member|invited|connected|error|disabled).
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("github")
    if (!g) return
    const msg: Record<string, [boolean, string]> = {
      member: [true, "Compte GitHub connecté — tu es membre de l'organisation."],
      invited: [true, "Compte GitHub connecté — invitation à l'organisation envoyée (vérifie tes emails)."],
      connected: [true, "Compte GitHub connecté."],
      error: [false, "La connexion GitHub a échoué. Réessaie."],
      disabled: [false, "Connexion GitHub non configurée (GITHUB_OAUTH_CLIENT_ID/SECRET)."],
    }
    const m = msg[g]
    if (m) (m[0] ? toast.success : toast.error)(m[1])
    window.history.replaceState(null, "", "/profile") // clean the URL
    load()
  }, [load])

  async function requestAccess() {
    setBusy(true)
    const res = await fetch("/api/profile/github", { method: "POST" })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Échec de la demande")
    toast.success(
      data.state === "active" ? "Tu es membre de l'organisation." : "Invitation envoyée — vérifie tes emails."
    )
    load()
  }

  async function disconnect() {
    if (!confirm("Déconnecter ton compte GitHub ?")) return
    const res = await fetch("/api/profile/github", { method: "DELETE" })
    if (!res.ok) return toast.error("Échec de la déconnexion")
    setState((s) => (s ? { ...s, connected: false, login: null, orgMember: false } : s))
    toast.success("Compte GitHub déconnecté.")
  }

  if (state && !state.oauthEnabled) {
    return (
      <p className="text-muted-foreground text-sm">
        Connexion GitHub non configurée. Un admin doit créer une OAuth App GitHub et définir{" "}
        <code>GITHUB_OAUTH_CLIENT_ID</code> / <code>GITHUB_OAUTH_CLIENT_SECRET</code>.
      </p>
    )
  }

  if (state?.connected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
          <Github className="size-4" /> <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
          <code className="text-xs">@{state.login}</code>
        </span>
        {state.orgMember ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs">
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Membre de {state.org}
          </span>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={requestAccess} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
            Demander l&apos;accès à {state.org}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={disconnect} className="gap-1.5">
          <X className="size-4" /> Déconnecter
        </Button>
      </div>
    )
  }

  return (
    <Button asChild variant="outline" className="gap-2">
      <a href="/api/github/connect">
        <Github className="size-4" /> Connect your GitHub
      </a>
    </Button>
  )
}
