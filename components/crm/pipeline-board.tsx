"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Rocket, Sparkles, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { LEAD_STAGES, LEAD_STAGE_META, type Lead, type LeadStage } from "@/lib/types"
import { cn } from "@/lib/utils"
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
import { ExportButton, ImportButton } from "@/components/shared/csv-tools"

type DeliveryLead = { id: string; name: string; role: string }

function money(v: number, c: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v)
}

// Suggest a project short code from a company name (letters/digits, ≤6).
function suggestCode(company: string) {
  return company.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "PROJ"
}

export function PipelineBoard({
  initialLeads,
  canManage,
  deliveryLeads = [],
}: {
  initialLeads: Lead[]
  canManage: boolean
  deliveryLeads?: DeliveryLead[]
}) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [dragId, setDragId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ company: "", contactName: "", contactEmail: "", value: "", source: "" })
  const [saving, setSaving] = useState(false)
  const [quoting, setQuoting] = useState<string | null>(null)

  // Convert dialog state.
  const [convertLead, setConvertLead] = useState<Lead | null>(null)
  const [converting, setConverting] = useState(false)
  const [cForm, setCForm] = useState({ projectName: "Delivery", projectShortCode: "", deliveryLeadId: "" })

  const byStage = (s: LeadStage) => leads.filter((l) => l.stage === s)
  const stageTotal = (s: LeadStage) =>
    byStage(s).reduce((sum, l) => sum + l.value, 0)

  async function moveTo(stage: LeadStage) {
    const id = dragId
    setDragId(null)
    if (!id || !canManage) return
    const lead = leads.find((l) => l.id === id)
    if (!lead || lead.stage === stage) return
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)))
    const res = await fetch(`/api/crm/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    })
    if (!res.ok) {
      toast.error("Could not move lead")
      router.refresh()
    }
  }

  async function create() {
    if (!form.company.trim()) return
    setSaving(true)
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, value: Number(form.value || 0) }),
    })
    setSaving(false)
    if (!res.ok) return toast.error("Could not create lead")
    const lead = (await res.json()) as Lead
    setLeads((ls) => [lead, ...ls])
    setOpen(false)
    setForm({ company: "", contactName: "", contactEmail: "", value: "", source: "" })
    toast.success("Lead added")
  }

  function openConvert(lead: Lead) {
    setCForm({ projectName: "Delivery", projectShortCode: suggestCode(lead.company), deliveryLeadId: "" })
    setConvertLead(lead)
  }

  async function submitConvert() {
    if (!convertLead) return
    setConverting(true)
    const res = await fetch(`/api/crm/leads/${convertLead.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: cForm.projectName.trim() || "Delivery",
        projectShortCode: cForm.projectShortCode.trim() || undefined,
        deliveryLeadId: cForm.deliveryLeadId || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setConverting(false)
    if (!res.ok) return toast.error(data.error ?? "Could not convert")
    setConvertLead(null)
    toast.success(
      data.reused
        ? `Project "${cForm.projectName}" (${data.shortCode}) added to existing workspace`
        : `Workspace created for ${convertLead.company}`
    )
    router.push(`/workspace/${data.workspaceId}/overview`)
  }

  async function removeLead(lead: Lead) {
    if (!confirm(`Delete lead "${lead.company}"?`)) return
    setLeads((ls) => ls.filter((l) => l.id !== lead.id))
    const res = await fetch(`/api/crm/leads/${lead.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Could not delete lead")
      setLeads((ls) => [lead, ...ls])
    } else {
      toast.success("Lead deleted")
    }
  }

  async function quote(lead: Lead) {
    setQuoting(lead.id)
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/quote`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return toast.error(data.error ?? "Could not generate quote")
      toast.success(`Draft quote ${data.number} created — see Admin panel`)
    } finally {
      setQuoting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          Pipeline total:{" "}
          <span className="text-foreground font-medium">
            {money(leads.filter((l) => l.stage !== "LOST").reduce((s, l) => s + l.value, 0), "TND")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href="/api/export?entity=leads" label="Export CSV" />
          {canManage && (
            <ImportButton endpoint="/api/import/leads" onDone={() => router.refresh()} label="Import CSV" />
          )}
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="size-4" /> New lead</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New lead</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cn">Contact</Label>
                    <Input id="cn" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ce">Email</Label>
                    <Input id="ce" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="val">Value (TND)</Label>
                    <Input id="val" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="src">Source</Label>
                    <Input id="src" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Inbound, Referral…" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create} disabled={saving || !form.company.trim()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LEAD_STAGES.map((stage) => {
          const items = byStage(stage)
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => moveTo(stage)}
              className="bg-muted/40 flex min-h-64 min-w-0 flex-col rounded-lg"
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    LEAD_STAGE_META[stage].color
                  )}
                >
                  {LEAD_STAGE_META[stage].label}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {items.length} · {money(stageTotal(stage), "TND")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable={canManage}
                    onDragStart={() => setDragId(l.id)}
                    className="bg-card rounded-md border p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{l.company}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-xs">{money(l.value, l.currency)}</span>
                        {canManage && (
                          <button
                            onClick={() => removeLead(l)}
                            title="Delete lead"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {l.contactName && (
                      <div className="text-muted-foreground mt-0.5 text-xs">{l.contactName}</div>
                    )}
                    {l.source && (
                      <div className="text-muted-foreground mt-1 text-[10px] uppercase">{l.source}</div>
                    )}
                    {canManage && (l.stage === "PROPOSAL" || l.stage === "QUALIFIED") && (
                      <Button size="sm" variant="ghost" className="mt-2 h-7 w-full gap-1.5 text-xs" disabled={quoting === l.id} onClick={() => quote(l)}>
                        {quoting === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        AI quote
                      </Button>
                    )}
                    {canManage && l.stage === "WON" && !l.workspaceId && (
                      <Button size="sm" variant="outline" className="mt-2 h-7 w-full gap-1.5" onClick={() => openConvert(l)}>
                        <Rocket className="size-3.5" /> Convert to workspace
                      </Button>
                    )}
                    {l.workspaceId && (
                      <div className="text-muted-foreground mt-2 text-[11px]">✓ converted</div>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-muted-foreground/50 flex flex-1 items-center justify-center rounded-md border border-dashed p-4 text-center text-xs">
                    {canManage ? "Drop a lead here" : "No leads"}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Convert dialog: choose the first project + delivery lead. */}
      <Dialog open={!!convertLead} onOpenChange={(o) => !o && setConvertLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert {convertLead?.company} to delivery</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-muted-foreground text-xs">
              Creates (or reuses) the client&apos;s workspace and seeds a project. Each project gets
              its own branch in the workspace repo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pname">Project name</Label>
                <Input
                  id="pname"
                  value={cForm.projectName}
                  onChange={(e) => setCForm({ ...cForm, projectName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pcode">Short code</Label>
                <Input
                  id="pcode"
                  value={cForm.projectShortCode}
                  maxLength={6}
                  onChange={(e) =>
                    setCForm({ ...cForm, projectShortCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                  }
                  placeholder="e.g. ACME"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Delivery lead</Label>
              <Select
                value={cForm.deliveryLeadId || "none"}
                onValueChange={(v) => setCForm({ ...cForm, deliveryLeadId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {deliveryLeads.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px]">
                Who owns delivery — independent of the sales rep converting the lead.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertLead(null)} disabled={converting}>
              Cancel
            </Button>
            <Button onClick={submitConvert} disabled={converting}>
              {converting ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
