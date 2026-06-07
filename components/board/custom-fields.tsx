"use client"

// Custom field values inside the ticket dialog. Definitions come from the
// project (/api/projects/:id/custom-fields); values are upserted per ticket
// (/api/tickets/:id/fields).

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FieldDef {
  id: string
  name: string
  type: "TEXT" | "NUMBER" | "SELECT" | "DATE"
  options: string[]
}

export function CustomFields({ ticketId, projectId }: { ticketId: string; projectId: string }) {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [values, setValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [defsRes, valsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/custom-fields`),
      fetch(`/api/tickets/${ticketId}/fields`),
    ])
    if (defsRes.ok) setFields(await defsRes.json())
    if (valsRes.ok) {
      const rows = (await valsRes.json()) as { fieldId: string; value: string }[]
      setValues(Object.fromEntries(rows.map((r) => [r.fieldId, r.value])))
    }
  }, [ticketId, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function save(fieldId: string, value: string) {
    setValues((v) => ({ ...v, [fieldId]: value }))
    const r = await fetch(`/api/tickets/${ticketId}/fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId, value }),
    })
    if (!r.ok) toast.error("Could not save field")
  }

  if (fields.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium uppercase">Custom fields</div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.id} className="space-y-1">
            <div className="text-muted-foreground text-[11px]">{f.name}</div>
            {f.type === "SELECT" ? (
              <Select value={values[f.id] ?? ""} onValueChange={(v) => save(f.id, v)}>
                <SelectTrigger size="sm" className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
                value={values[f.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                onBlur={(e) => save(f.id, e.target.value)}
                className="h-8 text-sm"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
