"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { LineItem } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function NewFinanceDoc() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"QUOTE" | "INVOICE">("QUOTE")
  const [clientName, setClientName] = useState("")
  const [taxRate, setTaxRate] = useState("19")
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ])
  const [saving, setSaving] = useState(false)

  function setItem(i: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  async function submit() {
    const cleaned = items.filter((i) => i.description.trim())
    if (!clientName.trim() || cleaned.length === 0) {
      toast.error("Client name and at least one line item are required")
      return
    }
    setSaving(true)
    const res = await fetch("/api/admin/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        clientName,
        items: cleaned,
        taxRate: Number(taxRate),
      }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not create document")
    const doc = await res.json()
    toast.success(`${doc.number} created`)
    setOpen(false)
    setClientName("")
    setItems([{ description: "", quantity: 1, unitPrice: 0 }])
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New devis / facture
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New {kind === "QUOTE" ? "devis (quote)" : "facture (invoice)"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "QUOTE" | "INVOICE")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUOTE">Devis (quote)</SelectItem>
                  <SelectItem value="INVOICE">Facture (invoice)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Line items</Label>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Description"
                  className="flex-1"
                  value={it.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-16"
                  value={it.quantity}
                  onChange={(e) => setItem(i, { quantity: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  className="w-28"
                  placeholder="Unit price"
                  value={it.unitPrice}
                  onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                  disabled={items.length === 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }])
              }
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tax">Tax rate (%)</Label>
            <Input
              id="tax"
              type="number"
              className="w-28"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
