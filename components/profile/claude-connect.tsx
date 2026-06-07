"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Claude/Anthropic brand mark (inline; brand orange).
function ClaudeMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#D97757" aria-hidden="true">
      <path d="M12 2.2l1.9 5.1 5.1-1.9-3.2 4.6 4.6 3.2-5.1-.9-.9 5.1-1.9-4.7-4.4 2.5 1.6-4.6L3.4 9.4l5.1 1L9.3 5l2.7 4.2L12 2.2z" />
      <circle cx="12" cy="12" r="2.4" fill="#D97757" />
    </svg>
  )
}

export function ClaudeConnect() {
  const [state, setState] = useState<{ connected: boolean; hint: string | null } | null>(null)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/profile/anthropic")
      if (r.ok) setState(await r.json())
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function connect() {
    if (!key.trim()) return
    setBusy(true)
    const res = await fetch("/api/profile/anthropic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Connexion échouée")
    setState({ connected: true, hint: data.hint })
    setKey("")
    setOpen(false)
    toast.success("Compte Claude connecté — l'IA serveur utilisera ta clé.")
  }

  async function disconnect() {
    if (!confirm("Déconnecter ton compte Claude ?")) return
    const res = await fetch("/api/profile/anthropic", { method: "DELETE" })
    if (!res.ok) return toast.error("Échec de la déconnexion")
    setState({ connected: false, hint: null })
    toast.success("Compte Claude déconnecté.")
  }

  if (state?.connected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm">
          <ClaudeMark /> <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> Connecté à Claude
          {state.hint && <code className="text-muted-foreground text-xs">{state.hint}</code>}
        </span>
        <Button variant="ghost" size="sm" onClick={disconnect} className="gap-1.5">
          <X className="size-4" /> Déconnecter
        </Button>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ClaudeMark /> Connect with Claude
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClaudeMark className="size-5" /> Connect with Claude
          </DialogTitle>
          <DialogDescription>
            Connecte ton compte Anthropic pour que l&apos;IA serveur (Copilot, revue, scaffold…)
            tourne sur <strong>ta</strong> clé. Crée une clé sur{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
            . Elle est stockée côté serveur, jamais ré-affichée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={connect} disabled={busy || !key.trim()} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ClaudeMark />}
            Connecter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
