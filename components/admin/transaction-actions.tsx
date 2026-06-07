"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { Transaction, TxnKind } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

// Edit / delete a charge or revenu. Shown in the admin Charges & revenus table.
export function TransactionActions({ txn }: { txn: Transaction }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<TxnKind>(txn.kind)
  const [label, setLabel] = useState(txn.label)
  const [category, setCategory] = useState(txn.category)
  const [amount, setAmount] = useState(String(txn.amount))
  const [date, setDate] = useState(txn.date.slice(0, 10))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!label.trim() || !amount) return toast.error("Label and amount required")
    setSaving(true)
    const res = await fetch(`/api/admin/transactions/${txn.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        label,
        category,
        amount: Number(amount),
        date: new Date(date).toISOString(),
      }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not save")
    toast.success("Entry updated")
    setOpen(false)
    router.refresh()
  }

  async function remove() {
    if (!confirm(`Delete "${txn.label}"?`)) return
    const res = await fetch(`/api/admin/transactions/${txn.id}`, { method: "DELETE" })
    if (!res.ok) return toast.error("Could not delete")
    toast.success("Entry deleted")
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(true)} aria-label="Edit">
        <Pencil className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="text-destructive size-8" onClick={remove} aria-label="Delete">
        <Trash2 className="size-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit charge / revenu</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as TxnKind)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REVENUE">Revenu (income)</SelectItem>
                    <SelectItem value="EXPENSE">Charge (expense)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-amount">Amount (TND)</Label>
                <Input id="t-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-label">Label</Label>
              <Input id="t-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-cat">Category</Label>
                <Input id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-date">Date</Label>
                <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
