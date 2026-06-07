"use client"

import { useRouter } from "next/navigation"

import type { DocStatus } from "@/lib/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUSES: DocStatus[] = ["DRAFT", "SENT", "ACCEPTED", "PAID", "REJECTED"]

export function FinanceStatus({
  id,
  status,
}: {
  id: string
  status: DocStatus
}) {
  const router = useRouter()
  async function update(next: DocStatus) {
    await fetch(`/api/admin/finance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    router.refresh()
  }
  return (
    <Select value={status} onValueChange={(v) => update(v as DocStatus)}>
      <SelectTrigger size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
