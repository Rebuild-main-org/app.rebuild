"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

// Delete a quote/invoice (devis / facture). Rendered only for ADMIN/SUPER_ADMIN.
export function FinanceDelete({ id, number }: { id: string; number: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!confirm(`Supprimer ${number} ? Cette action est définitive.`)) return
    setBusy(true)
    const res = await fetch(`/api/admin/finance/${id}`, { method: "DELETE" })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return toast.error(data.error ?? "Suppression échouée")
    }
    toast.success(`${number} supprimé`)
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={remove}
      disabled={busy}
      className="text-muted-foreground hover:text-destructive size-8"
      aria-label={`Supprimer ${number}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  )
}
