"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { ALL_ROLES, ROLE_LABELS, type Role } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Keep in sync with SECTIONS in lib/permissions.ts (server-only, can't import here).
const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "blueprints", label: "Blueprints" },
  { key: "workspaces", label: "Workspaces" },
  { key: "crm", label: "CRM" },
  { key: "support", label: "Support" },
  { key: "analytics", label: "Analytics" },
  { key: "reports", label: "Reports" },
] as const

// Roles shown as columns (SUPER_ADMIN always has access, so it's excluded).
const ROLES: Role[] = ALL_ROLES.filter((r) => r !== "SUPER_ADMIN")

type Matrix = Record<string, Record<string, boolean>>

export function PermissionsMatrix() {
  const [matrix, setMatrix] = useState<Matrix>({})
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState("loading")
    const res = await fetch("/api/admin/permissions")
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Failed" }))
      setErrorMsg(error ?? "Failed to load")
      setState("error")
      return
    }
    const { matrix } = await res.json()
    setMatrix(matrix)
    setState("ready")
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  async function toggle(section: string, role: Role, allowed: boolean) {
    const key = `${section}:${role}`
    setMatrix((m) => ({ ...m, [section]: { ...m[section], [role]: allowed } }))
    setSaving(key)
    const res = await fetch("/api/admin/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, role, allowed }),
    })
    setSaving(null)
    if (!res.ok) {
      setMatrix((m) => ({ ...m, [section]: { ...m[section], [role]: !allowed } }))
      toast.error("Could not save")
    }
  }

  if (state === "loading") {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading permissions…
      </div>
    )
  }
  if (state === "error") {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
        {errorMsg}
        <div className="text-muted-foreground mt-1 text-xs">
          Run <code>supabase/permissions.sql</code> to create the <code>section_permissions</code> table.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Choose which sections each role can access in the sidebar. Super Admin always has
        full access.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-28">Section</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="text-center text-xs">{ROLE_LABELS[r]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {SECTIONS.map((s) => (
              <TableRow key={s.key}>
                <TableCell className="font-medium">{s.label}</TableCell>
                {ROLES.map((r) => (
                  <TableCell key={r} className="text-center">
                    <Checkbox
                      checked={matrix[s.key]?.[r] ?? false}
                      disabled={saving === `${s.key}:${r}`}
                      onCheckedChange={(v) => toggle(s.key, r, !!v)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
