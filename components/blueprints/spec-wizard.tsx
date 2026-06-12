"use client"

import { useMemo, useState } from "react"
import { Check, Copy, Download, Loader2, Plus, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { EMPTY_SPEC_FORM, type BlueprintDoc, type SpecForm } from "@/lib/blueprint-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

// --- form model (shared type; see lib/blueprint-types.ts) -------------------
type Form = SpecForm

// Seed the wizard from an (optionally AI-extracted) form, keeping at least one
// editable row in each repeatable list.
function seedForm(f?: SpecForm): Form {
  if (!f) return structuredClone(EMPTY_SPEC_FORM)
  const arr = <T,>(a: T[] | undefined, fallback: T[]) => (a && a.length ? a : fallback)
  return {
    ...EMPTY_SPEC_FORM,
    ...f,
    useCases: arr(f.useCases, EMPTY_SPEC_FORM.useCases),
    latencyPaths: arr(f.latencyPaths, EMPTY_SPEC_FORM.latencyPaths),
    consistency: arr(f.consistency, EMPTY_SPEC_FORM.consistency),
    entities: arr(f.entities, EMPTY_SPEC_FORM.entities),
    integrations: arr(f.integrations, EMPTY_SPEC_FORM.integrations),
    compliance: f.compliance ?? [],
    languages: f.languages ?? [],
    ui: f.ui ?? [],
    mcps: f.mcps ?? [],
  }
}

// Curated chip options per group (each group also accepts free « Other… » values).
const LANG_OPTIONS = [
  "TypeScript", "JavaScript", "Node.js", "Next.js", "React", "Vue", "Nuxt", "SvelteKit",
  "Angular", "Astro", "Remix", "SolidJS", "NestJS", "Python/FastAPI", "Django", "Go",
  "Ruby on Rails", "PHP/Laravel", "Java/Spring", ".NET",
]
const UI_OPTIONS = [
  "shadcn/ui", "Tailwind CSS", "Radix UI", "MUI", "Chakra UI", "Mantine", "Ant Design",
  "Headless UI", "DaisyUI", "Bootstrap", "styled-components", "CSS Modules",
]
const MCP_OPTIONS = [
  "Figma", "GitHub", "Supabase", "Vercel", "Postgres", "Stripe", "Linear", "Notion",
  "Slack", "Sentry", "Browser/Playwright", "Filesystem",
]

const COMPLIANCE_OPTIONS = ["GDPR", "PCI-DSS", "HIPAA", "SOC2"]
const STEPS = [
  "Project",
  "Use cases",
  "NFR",
  "Data & access",
  "Integrations & stack",
  "Quality gates",
  "Documents",
  "Summary",
]

const Q = (s: string) => JSON.stringify(s || "") // YAML-safe scalar
const toList = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean)

function buildSpecYaml(f: Form, figmaUrl: string, docNames: string[]): string {
  const L: string[] = []
  L.push(`name: ${Q(f.name)}`)
  L.push(`summary: ${Q(f.summary)}`)
  L.push(`deploy_target: ${Q(f.deployTarget)}`)
  const inlineArr = (key: string, arr: string[]) => {
    if (arr.length) L.push(`  ${key}: [${arr.map(Q).join(", ")}]`)
  }
  const other = toList(f.stack)
  if (f.languages.length || f.ui.length || f.mcps.length || other.length) {
    L.push(`stack:`)
    inlineArr("languages", f.languages)
    inlineArr("ui", f.ui)
    inlineArr("mcps", f.mcps)
    inlineArr("other", other)
  } else {
    L.push(`stack: {}`)
  }
  L.push(`use_cases:`)
  for (const u of f.useCases.filter((x) => x.name)) {
    L.push(`  - name: ${Q(u.name)}`)
    L.push(`    actor: ${Q(u.actor)}`)
    L.push(`    acceptance: ${Q(u.acceptance)}`)
  }
  L.push(`nfr:`)
  L.push(`  scale: ${Q(f.scale)}`)
  L.push(`  availability_slo: ${Q(f.availabilitySlo)}`)
  L.push(`  error_budget: ${Q(f.errorBudget)}`)
  L.push(`  retention: ${Q(f.retention)}`)
  L.push(`  latency_budgets_ms:`)
  for (const p of f.latencyPaths.filter((x) => x.path)) {
    L.push(`    - path: ${Q(p.path)}`)
    L.push(`      p99: ${Number(p.p99) || Q(p.p99)}`)
  }
  L.push(`  consistency:`)
  for (const c of f.consistency.filter((x) => x.domain)) {
    L.push(`    - domain: ${Q(c.domain)}`)
    L.push(`      level: ${c.level}`)
  }
  L.push(`  compliance: [${f.compliance.join(", ")}]`)
  L.push(`data:`)
  L.push(`  entities:`)
  for (const e of f.entities.filter((x) => x.name)) {
    L.push(`    - name: ${Q(e.name)}`)
    L.push(`      access_patterns:`)
    for (const ap of toList(e.accessPatterns)) L.push(`        - ${Q(ap)}`)
    L.push(`      read_write_ratio: ${Q(e.readWriteRatio)}`)
    L.push(`      pii: ${e.pii ? "true" : "false"}`)
  }
  L.push(`integrations:`)
  for (const i of f.integrations.filter((x) => x.name)) {
    L.push(`  - name: ${Q(i.name)}`)
    L.push(`    sla_ms: ${Number(i.slaMs) || Q(i.slaMs)}`)
    L.push(`    on_failure: ${Q(i.onFailure)}`)
  }
  L.push(`quality_gates:`)
  L.push(`  coverage: ${Q(f.coverageTarget)}`)
  L.push(`  load_test: ${Q(f.loadTestTarget)}`)
  if (toList(f.qualityGates).length) {
    L.push(`  gates:`)
    for (const g of toList(f.qualityGates)) L.push(`    - ${Q(g)}`)
  }
  if (figmaUrl || docNames.length) {
    L.push(`documents:`)
    if (figmaUrl) L.push(`  figma: ${Q(figmaUrl)}`)
    if (docNames.length) {
      L.push(`  files:`)
      for (const n of docNames) L.push(`    - ${Q(n)}`)
    }
  }
  return L.join("\n") + "\n"
}

// Step-8 completeness gate (form-side validation 2).
function missingFields(f: Form): string[] {
  const m: string[] = []
  if (!f.name.trim()) m.push("Project name")
  if (!f.summary.trim()) m.push("Summary")
  if (f.languages.length === 0) m.push("Languages / frameworks (≥ 1)")
  if (!f.useCases.some((u) => u.name && u.acceptance)) m.push("≥ 1 use case with acceptance criteria")
  if (!f.scale.trim()) m.push("Scale / volume")
  if (!f.availabilitySlo.trim()) m.push("Availability SLO")
  if (!f.latencyPaths.some((p) => p.path && p.p99)) m.push("≥ 1 latency budget (path + p99)")
  if (!f.consistency.some((c) => c.domain)) m.push("≥ 1 consistency domain")
  if (!f.entities.some((e) => e.name && e.accessPatterns)) m.push("≥ 1 entity with access patterns")
  if (!f.integrations.some((i) => i.name && i.onFailure)) m.push("≥ 1 integration with on_failure")
  if (!f.coverageTarget.trim() && !f.qualityGates.trim()) m.push("Quality gates (coverage or list)")
  if (f.entities.some((e) => e.pii) && !f.compliance.includes("GDPR"))
    m.push("PII present → GDPR required in compliance")
  return m
}

export function SpecWizard({
  blueprintId,
  initialFigma,
  initialDocuments,
  initialForm,
  onSpec,
}: {
  blueprintId: string
  initialFigma: string
  initialDocuments: BlueprintDoc[]
  initialForm?: SpecForm
  onSpec: (yaml: string) => void
}) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState<Form>(() => seedForm(initialForm))
  const [figmaUrl, setFigmaUrl] = useState(initialFigma)
  const [docs, setDocs] = useState<BlueprintDoc[]>(initialDocuments ?? [])
  const [uploading, setUploading] = useState(false)

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const yaml = useMemo(() => buildSpecYaml(f, figmaUrl, docs.map((d) => d.name)), [f, figmaUrl, docs])
  const missing = useMemo(() => missingFields(f), [f])

  async function upload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`/api/blueprints/${blueprintId}/documents`, { method: "POST", body: fd })
    setUploading(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(data.error ?? "Upload failed")
    setDocs(data.documents)
    toast.success("File added")
  }
  async function removeDoc(docId: string) {
    const res = await fetch(`/api/blueprints/${blueprintId}/documents?docId=${docId}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.documents)
  }
  async function saveFigma() {
    await fetch(`/api/blueprints/${blueprintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUrl }),
    })
  }

  return (
    <div className="space-y-4">
      {/* step rail */}
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              i === step
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="min-h-[16rem] rounded-lg border p-4">
        {step === 0 && (
          <div className="space-y-3">
            <Field label="Project name">
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme Rides" />
            </Field>
            <Field label="Summary / goal">
              <Textarea value={f.summary} onChange={(e) => set("summary", e.target.value)} rows={3} />
            </Field>
            <Field label="Deployment target">
              <Input value={f.deployTarget} onChange={(e) => set("deployTarget", e.target.value)} placeholder="Vercel · AWS · k8s…" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <Repeatable
            title="Use cases"
            items={f.useCases}
            onAdd={() => set("useCases", [...f.useCases, { name: "", actor: "", acceptance: "" }])}
            onRemove={(i) => set("useCases", f.useCases.filter((_, x) => x !== i))}
            render={(u, i) => (
              <div className="space-y-2">
                <Input placeholder="Name (e.g. Request a ride)" value={u.name} onChange={(e) => upd(f, set, "useCases", i, { name: e.target.value })} />
                <Input placeholder="Actor (e.g. Passenger)" value={u.actor} onChange={(e) => upd(f, set, "useCases", i, { actor: e.target.value })} />
                <Textarea placeholder="Measurable acceptance criteria (e.g. ETA < 5s, 99% of cases)" value={u.acceptance} rows={2} onChange={(e) => upd(f, set, "useCases", i, { acceptance: e.target.value })} />
              </div>
            )}
          />
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Scale / volume"><Input value={f.scale} onChange={(e) => set("scale", e.target.value)} placeholder="5000 rps · 10B lignes" /></Field>
              <Field label="Availability SLO"><Input value={f.availabilitySlo} onChange={(e) => set("availabilitySlo", e.target.value)} placeholder="99.95%" /></Field>
              <Field label="Error budget"><Input value={f.errorBudget} onChange={(e) => set("errorBudget", e.target.value)} placeholder="0.05% / month" /></Field>
              <Field label="Retention"><Input value={f.retention} onChange={(e) => set("retention", e.target.value)} placeholder="90 days" /></Field>
            </div>
            <Repeatable
              title="Latency budgets (critical paths)"
              items={f.latencyPaths}
              onAdd={() => set("latencyPaths", [...f.latencyPaths, { path: "", p99: "" }])}
              onRemove={(i) => set("latencyPaths", f.latencyPaths.filter((_, x) => x !== i))}
              render={(p, i) => (
                <div className="flex gap-2">
                  <Input placeholder="POST /trips" value={p.path} onChange={(e) => upd(f, set, "latencyPaths", i, { path: e.target.value })} />
                  <Input placeholder="p99 ms" value={p.p99} onChange={(e) => upd(f, set, "latencyPaths", i, { p99: e.target.value })} className="w-28" />
                </div>
              )}
            />
            <Repeatable
              title="Consistency by domain"
              items={f.consistency}
              onAdd={() => set("consistency", [...f.consistency, { domain: "", level: "strong" }])}
              onRemove={(i) => set("consistency", f.consistency.filter((_, x) => x !== i))}
              render={(c, i) => (
                <div className="flex gap-2">
                  <Input placeholder="Domain (e.g. payment)" value={c.domain} onChange={(e) => upd(f, set, "consistency", i, { domain: e.target.value })} />
                  <select
                    className="border-input bg-background rounded-md border px-2 text-sm"
                    value={c.level}
                    onChange={(e) => upd(f, set, "consistency", i, { level: e.target.value as "strong" | "eventual" })}
                  >
                    <option value="strong">strong</option>
                    <option value="eventual">eventual</option>
                  </select>
                </div>
              )}
            />
            <Field label="Compliance">
              <div className="flex flex-wrap gap-3">
                {COMPLIANCE_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={f.compliance.includes(opt)}
                      onCheckedChange={(c) =>
                        set("compliance", c === true ? [...f.compliance, opt] : f.compliance.filter((x) => x !== opt))
                      }
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <Repeatable
            title="Entities & access patterns"
            items={f.entities}
            onAdd={() => set("entities", [...f.entities, { name: "", accessPatterns: "", readWriteRatio: "", pii: false }])}
            onRemove={(i) => set("entities", f.entities.filter((_, x) => x !== i))}
            render={(e, i) => (
              <div className="space-y-2">
                <Input placeholder="Entity (e.g. trip)" value={e.name} onChange={(ev) => upd(f, set, "entities", i, { name: ev.target.value })} />
                <Textarea placeholder="Access patterns (one per line, e.g. by driver_id where status=ENROUTE)" rows={2} value={e.accessPatterns} onChange={(ev) => upd(f, set, "entities", i, { accessPatterns: ev.target.value })} />
                <div className="flex items-center gap-3">
                  <Input placeholder="read/write ratio (ex. 90/10)" value={e.readWriteRatio} onChange={(ev) => upd(f, set, "entities", i, { readWriteRatio: ev.target.value })} />
                  <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <Checkbox checked={e.pii} onCheckedChange={(c) => upd(f, set, "entities", i, { pii: c === true })} /> PII
                  </label>
                </div>
              </div>
            )}
          />
        )}

        {step === 4 && (
          <div className="space-y-4">
            <ChipGroup title="Languages & web frameworks → stack.languages" options={LANG_OPTIONS} selected={f.languages} onChange={(v) => set("languages", v)} />
            <ChipGroup title="UI / components → stack.ui" options={UI_OPTIONS} selected={f.ui} onChange={(v) => set("ui", v)} />
            <ChipGroup title="MCP → stack.mcps" options={MCP_OPTIONS} selected={f.mcps} onChange={(v) => set("mcps", v)} />
            <Field label="Other (datastore / cache / queue…, free)">
              <Input value={f.stack} onChange={(e) => set("stack", e.target.value)} placeholder="Postgres, Redis, SQS, …" />
            </Field>
            <Repeatable
              title="Integrations"
              items={f.integrations}
              onAdd={() => set("integrations", [...f.integrations, { name: "", slaMs: "", onFailure: "" }])}
              onRemove={(i) => set("integrations", f.integrations.filter((_, x) => x !== i))}
              render={(it, i) => (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Name (e.g. stripe)" value={it.name} onChange={(e) => upd(f, set, "integrations", i, { name: e.target.value })} />
                    <Input placeholder="sla ms" value={it.slaMs} onChange={(e) => upd(f, set, "integrations", i, { slaMs: e.target.value })} className="w-28" />
                  </div>
                  <Input placeholder="on_failure (timeout/retry/idempotency/fallback/circuit)" value={it.onFailure} onChange={(e) => upd(f, set, "integrations", i, { onFailure: e.target.value })} />
                </div>
              )}
            />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Coverage target"><Input value={f.coverageTarget} onChange={(e) => set("coverageTarget", e.target.value)} placeholder="≥ 80%" /></Field>
              <Field label="Load-test target"><Input value={f.loadTestTarget} onChange={(e) => set("loadTestTarget", e.target.value)} placeholder="5000 rps p99 < 200ms" /></Field>
            </div>
            <Field label="Quality gates (one per line)">
              <Textarea value={f.qualityGates} onChange={(e) => set("qualityGates", e.target.value)} rows={4} placeholder={"build\ntypecheck\nlint\nunit\nintegration\ncontract\ne2e\nload\nsecurity"} />
            </Field>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <Field label="Figma link">
              <Input value={figmaUrl} onChange={(e) => setFigmaUrl(e.target.value)} onBlur={saveFigma} placeholder="https://figma.com/file/…" />
            </Field>
            <Field label="Documents (uploads → Supabase bucket)">
              <label className="border-input hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Choose a file
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) upload(file)
                    e.target.value = ""
                  }}
                />
              </label>
            </Field>
            {docs.length > 0 && (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                    <span className="truncate">
                      {d.name} <span className="text-muted-foreground text-xs">({(d.size / 1024).toFixed(0)} kB)</span>
                    </span>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => removeDoc(d.id)}>
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-3">
            {missing.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 p-3 text-sm">
                <p className="text-amber-600 dark:text-amber-400 font-medium">Missing required fields:</p>
                <ul className="ml-4 mt-1 list-disc">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" /> Spec complete — ready for the critique.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(yaml); toast.success("Copied") }}>
                <Copy className="size-4" /> Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const blob = new Blob([yaml], { type: "text/yaml" })
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = "project.spec.yaml"
                  a.click()
                }}
              >
                <Download className="size-4" /> Download
              </Button>
              <Button size="sm" className="gap-1.5" disabled={missing.length > 0} onClick={() => onSpec(yaml)}>
                <Check className="size-4" /> Use this spec
              </Button>
            </div>

            <pre className="bg-muted max-h-[24rem] overflow-auto rounded-md p-3 font-mono text-xs">{yaml}</pre>
          </div>
        )}
      </div>

      {/* nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Previous
        </Button>
        <span className="text-muted-foreground text-xs">
          Step {step + 1}/{STEPS.length}
        </span>
        <Button variant="ghost" size="sm" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

// Update field `i` of a repeatable list `key` with a partial patch.
function upd<K extends keyof Form>(
  f: Form,
  set: <KK extends keyof Form>(k: KK, v: Form[KK]) => void,
  key: K,
  i: number,
  patch: Partial<(Form[K] extends (infer U)[] ? U : never)>
) {
  const arr = [...(f[key] as unknown as Record<string, unknown>[])]
  arr[i] = { ...arr[i], ...(patch as Record<string, unknown>) }
  set(key, arr as unknown as Form[K])
}

// Multi-select chips + a free « Other… » input. Selected values not in `options`
// (custom entries) are rendered as removable chips too.
function ChipGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [custom, setCustom] = useState("")
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const addCustom = () => {
    const v = custom.trim()
    if (v && !selected.includes(v)) onChange([...selected, v])
    setCustom("")
  }
  const customs = selected.filter((s) => !options.includes(s))

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        on
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:border-foreground/30"
      }`}
    >
      {label}
      {on && customs.includes(label) ? " ✕" : ""}
    </button>
  )

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{title}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => chip(o, selected.includes(o), () => toggle(o)))}
        {customs.map((o) => chip(o, true, () => toggle(o)))}
      </div>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Other…"
          className="h-8"
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!custom.trim()}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function Repeatable<T>({
  title,
  items,
  onAdd,
  onRemove,
  render,
}: {
  title: string
  items: T[]
  onAdd: () => void
  onRemove: (i: number) => void
  render: (item: T, i: number) => React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <Button variant="outline" size="sm" className="gap-1" onClick={onAdd}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="relative rounded-md border p-3 pr-9">
            {render(item, i)}
            {items.length > 1 && (
              <button
                onClick={() => onRemove(i)}
                className="text-muted-foreground hover:text-destructive absolute right-2 top-2"
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
