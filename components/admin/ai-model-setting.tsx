"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// SUPER_ADMIN control: pick the Claude model used by the whole platform's
// server AI (review, triage, scaffold, copilot…).
export function AiModelSetting({
  current,
  models,
  defaultModel,
}: {
  current: string
  models: { id: string; label: string }[]
  defaultModel: string
}) {
  const [model, setModel] = useState(current)
  const [saved, setSaved] = useState(current)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiModel: model }),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Échec de l'enregistrement")
    setSaved(model)
    toast.success("Modèle IA mis à jour pour toute la plateforme.")
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={model} onValueChange={setModel}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
              {m.id === defaultModel ? " · défaut" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={save} disabled={busy || model === saved} className="gap-2">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        Appliquer à tous
      </Button>
      <span className="text-muted-foreground text-xs">
        Actif : <code>{saved}</code>
      </span>
    </div>
  )
}
