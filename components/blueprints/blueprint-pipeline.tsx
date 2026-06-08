"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDashed,
  FileUp,
  Loader2,
  Play,
  Rocket,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import {
  ALL_GATES,
  BLUEPRINT_STEPS,
  PREREQ_ITEMS,
  canApprove,
  pendingGates,
  type Blueprint,
  type GateKey,
  type SpecForm,
  type SpecRevision,
} from "@/lib/blueprint-types"
import { SpecWizard } from "@/components/blueprints/spec-wizard"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const SEVERITY_TONE: Record<string, string> = {
  BLOCKER: "border-red-500/40 text-red-600 dark:text-red-400",
  MAJOR: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  MINOR: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300",
  INFO: "border-blue-500/40 text-blue-600 dark:text-blue-400",
}

function GateBadge({ on }: { on: boolean | undefined }) {
  return on ? (
    <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
      <Check className="size-3" /> gate OK
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <CircleDashed className="size-3" /> en attente
    </Badge>
  )
}

export function BlueprintPipeline({
  initial,
  canCreateWorkspace,
  canDelete,
}: {
  initial: Blueprint
  canCreateWorkspace: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [bp, setBp] = useState<Blueprint>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [spec, setSpec] = useState(initial.specYaml)
  const [answers, setAnswers] = useState(initial.answers)
  const [feasibility, setFeasibility] = useState(initial.feasibility)
  const [designDoc, setDesignDoc] = useState(initial.designDoc)
  const [acceptanceYaml, setAcceptanceYaml] = useState(initial.acceptanceYaml)
  const [validation, setValidation] = useState<{ ok: boolean; missing: string[]; present: string[] } | null>(null)
  const [intakeMode, setIntakeMode] = useState<"wizard" | "yaml">(initial.specYaml.trim() ? "yaml" : "wizard")
  const [proposal, setProposal] = useState<SpecRevision | null>(null)
  const [proposedSpec, setProposedSpec] = useState("")
  const [wizardForm, setWizardForm] = useState<SpecForm | undefined>(undefined)
  const [wizardKey, setWizardKey] = useState(0)
  const mdInputRef = useRef<HTMLInputElement>(null)

  const readOnly = bp.status === "CONVERTED"

  // Import a markdown brief/doc and PRE-FILL the guided assistant: the doc is
  // sent to the AI extractor which returns the structured wizard fields. Falls
  // back to dropping the raw text in the YAML editor if extraction is unavailable.
  async function importMd(file: File) {
    const text = await file.text()
    if (!text.trim()) {
      toast.error("Fichier vide")
      return
    }
    setBusy("import")
    try {
      const data = await api("/extract", { method: "POST", body: JSON.stringify({ content: text }) })
      setWizardForm(data.form as SpecForm)
      setWizardKey((k) => k + 1)
      setIntakeMode("wizard")
      toast.success(`Assistant pré-rempli depuis ${file.name}`)
    } catch (e) {
      setSpec(text)
      setIntakeMode("yaml")
      await savePatch({ specYaml: text }, `Importé (brut) depuis ${file.name}`)
      toast.message(e instanceof Error ? e.message : "Extraction IA indisponible — doc mis dans l'éditeur YAML")
    } finally {
      setBusy(null)
    }
  }

  async function api(path: string, init?: RequestInit) {
    const res = await fetch(`/api/blueprints/${bp.id}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return data
  }

  async function savePatch(patch: Record<string, unknown>, label = "Enregistré") {
    setBusy("save")
    try {
      const updated = await api("", { method: "PATCH", body: JSON.stringify(patch) })
      setBp(updated)
      toast.success(label)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function runValidate() {
    setBusy("validate")
    try {
      // persist any spec edit first
      if (spec !== bp.specYaml) await api("", { method: "PATCH", body: JSON.stringify({ specYaml: spec }) })
      const v = await api("/validate", { method: "POST" })
      setValidation({ ok: v.ok, missing: v.missing, present: v.present })
      if (v.blueprint) setBp(v.blueprint) // reflect the persisted gate exactly
      else setBp((b) => ({ ...b, specYaml: spec, gates: { ...b.gates, validate: v.ok } }))
      toast[v.ok ? "success" : "error"](v.ok ? "Spec complète" : `${v.missing.length} section(s) manquante(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function runCritique() {
    setBusy("critique")
    try {
      if (spec !== bp.specYaml) await api("", { method: "PATCH", body: JSON.stringify({ specYaml: spec }) })
      if (answers !== bp.answers) await api("", { method: "PATCH", body: JSON.stringify({ answers }) })
      const result = await api("/critique", { method: "POST" })
      setBp((b) => ({
        ...b,
        specYaml: spec,
        answers,
        critique: result,
        gates: { ...b.gates, critique: result.readiness === "READY" },
      }))
      toast[result.readiness === "READY" ? "success" : "error"](
        result.readiness === "READY" ? "READY — aucun bloqueur" : "BLOCK — voir les findings"
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  // The critique proposes a revised spec; the user edits it then approves.
  async function runPropose() {
    setBusy("propose")
    try {
      const { revision } = await api("/propose", { method: "POST" })
      setProposal(revision as SpecRevision)
      setProposedSpec((revision as SpecRevision).revised_spec)
      toast.success("Corrections proposées — relis, modifie, puis approuve")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function approveProposal() {
    setSpec(proposedSpec)
    setIntakeMode("yaml")
    setProposal(null)
    // Replacing the spec re-arms the validate/critique gates (server-side).
    await savePatch({ specYaml: proposedSpec }, "Spec corrigée approuvée")
  }

  async function runPlan() {
    setBusy("plan")
    try {
      const { plan } = await api("/plan", { method: "POST" })
      setBp((b) => ({ ...b, plan, gates: { ...b.gates, plan: (plan?.projects?.length ?? 0) > 0 } }))
      toast.success(`Plan généré — ${plan?.projects?.length ?? 0} projet(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  async function toggleGate(gate: GateKey, passed: boolean) {
    try {
      const updated = await api("/gate", { method: "POST", body: JSON.stringify({ gate, passed }) })
      setBp(updated)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  async function setPrereq(key: string, checked: boolean) {
    const prereqs = { ...bp.prereqs, [key]: checked }
    await savePatch({ prereqs }, "Pré-requis mis à jour")
  }

  async function approve() {
    setBusy("approve")
    try {
      const updated = await api("/approve", { method: "POST" })
      setBp(updated)
      toast.success("Blueprint approuvé ✅")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gates incomplets")
    } finally {
      setBusy(null)
    }
  }

  async function deleteBlueprint() {
    if (!confirm(`Supprimer définitivement le blueprint « ${bp.title} » ?`)) return
    setBusy("delete")
    try {
      await api("", { method: "DELETE" })
      toast.success("Blueprint supprimé")
      router.push("/blueprints")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression échouée")
      setBusy(null)
    }
  }

  async function convert() {
    if (!confirm("Créer le workspace depuis ce Blueprint approuvé ?")) return
    setBusy("convert")
    try {
      const res = await api("/convert", { method: "POST" })
      toast.success(`Workspace créé — ${res.projects} projet(s), ${res.tickets} ticket(s)`)
      router.push(`/workspace/${res.workspace.id}/overview`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la conversion")
    } finally {
      setBusy(null)
    }
  }

  const greenCount = ALL_GATES.filter((g) => bp.gates[g]).length
  const pending = pendingGates(bp)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header + stepper */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{bp.title}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{bp.status}</Badge>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteBlueprint}
                disabled={busy === "delete"}
                className="text-muted-foreground hover:text-destructive gap-1.5"
              >
                {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Supprimer
              </Button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Phase A — Conception · gates {greenCount}/{ALL_GATES.length}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {BLUEPRINT_STEPS.map((s, i) => {
            const done = s.gate ? bp.gates[s.gate] : true
            return (
              <span
                key={s.key}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  done ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-3" /> : <CircleDashed className="size-3" />}
                {i + 1}. {s.label}
              </span>
            )
          })}
        </div>
      </div>

      {readOnly && (
        <Card className="border-blue-500/40">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
            <span>Ce Blueprint a été converti en workspace.</span>
            {bp.workspaceId && (
              <Button size="sm" onClick={() => router.push(`/workspace/${bp.workspaceId}/overview`)}>
                Ouvrir le workspace <ArrowRight className="size-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 1. Intake — spec */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">1 · Intake — project.spec.yaml</CardTitle>
            {!readOnly && (
              <div className="flex flex-wrap gap-1">
                <Button variant={intakeMode === "wizard" ? "default" : "outline"} size="sm" onClick={() => setIntakeMode("wizard")}>
                  Assistant guidé
                </Button>
                <Button variant={intakeMode === "yaml" ? "default" : "outline"} size="sm" onClick={() => setIntakeMode("yaml")}>
                  Éditeur YAML
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === "import"} onClick={() => mdInputRef.current?.click()}>
                  {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Importer .md
                </Button>
                <input
                  ref={mdInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) importMd(file)
                    e.target.value = ""
                  }}
                />
              </div>
            )}
          </div>
          <CardDescription>L&apos;artefact source de toute la Phase A.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {intakeMode === "wizard" && !readOnly ? (
            <SpecWizard
              key={wizardKey}
              blueprintId={bp.id}
              initialFigma={bp.figmaUrl}
              initialDocuments={bp.documents ?? []}
              initialForm={wizardForm}
              onSpec={(yaml) => {
                setSpec(yaml)
                setIntakeMode("yaml")
                savePatch({ specYaml: yaml }, "Spec générée et enregistrée")
              }}
            />
          ) : (
            <>
              <Textarea
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                disabled={readOnly}
                rows={12}
                placeholder={"name: ...\nnfr:\n  scale: ...\ndata:\n  entities: ...\nintegrations: ...\ncompliance: [GDPR]\nquality_gates: ..."}
                className="font-mono text-xs"
              />
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={() => savePatch({ specYaml: spec }, "Spec enregistrée")} disabled={busy === "save"}>
                  {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null} Enregistrer la spec
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Validation */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">2 · Validation de spec</CardTitle>
            <GateBadge on={bp.gates.validate} />
          </div>
          <CardDescription>Gate dur : NFR, patterns d&apos;accès et modes de défaillance présents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runValidate} disabled={readOnly || busy === "validate"} className="gap-2">
            {busy === "validate" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Valider la complétude
          </Button>
          {validation && (
            <div className="text-sm">
              {validation.missing.length === 0 ? (
                <p className="text-emerald-600 dark:text-emerald-400">Toutes les sections requises sont présentes.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-red-600 dark:text-red-400">Sections manquantes :</p>
                  <ul className="ml-4 list-disc">
                    {validation.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Critique */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">3 · Critique de spec (IA)</CardTitle>
            <GateBadge on={bp.gates.critique} />
          </div>
          <CardDescription>Gate : readiness === &quot;READY&quot; (zéro BLOCKER, zéro question bloquante).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runCritique} disabled={readOnly || busy === "critique"} className="gap-2">
            {busy === "critique" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Lancer la critique
          </Button>

          {bp.critique && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className={bp.critique.readiness === "READY" ? SEVERITY_TONE.INFO : SEVERITY_TONE.BLOCKER}>
                  {bp.critique.readiness}
                </Badge>
                <span className="text-muted-foreground">score {bp.critique.spec_quality_score}/100</span>
              </div>
              <p className="text-sm">{bp.critique.summary}</p>

              {bp.critique.findings.length > 0 && (
                <div className="space-y-2">
                  {bp.critique.findings.map((f) => (
                    <div key={f.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={SEVERITY_TONE[f.severity]}>
                          {f.severity}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{f.category}</span>
                        <code className="text-muted-foreground text-xs">{f.spec_path}</code>
                      </div>
                      <p className="mt-1 font-medium">{f.problem}</p>
                      <p className="text-muted-foreground mt-0.5">{f.why_it_matters}</p>
                      <p className="mt-0.5">→ {f.suggested_resolution}</p>
                    </div>
                  ))}
                </div>
              )}

              {bp.critique.open_questions.length > 0 && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Questions ouvertes :</p>
                  {bp.critique.open_questions.map((q) => (
                    <div key={q.id} className="rounded-md border p-2">
                      <span className="flex items-center gap-2">
                        {q.blocking && <AlertTriangle className="size-3.5 text-red-500" />}
                        {q.question}
                      </span>
                      {q.proposed_default && (
                        <span className="text-muted-foreground block text-xs">défaut proposé : {q.proposed_default}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {bp.critique.next_action && (
                <p className="text-muted-foreground text-sm">Prochaine action : {bp.critique.next_action}</p>
              )}
            </div>
          )}

          <Separator />
          <div className="space-y-2">
            <label className="text-sm font-medium">Réponses / résolutions humaines</label>
            <Textarea
              value={answers}
              onChange={(e) => setAnswers(e.target.value)}
              disabled={readOnly}
              rows={4}
              placeholder="Réponds aux questions bloquantes (Q-001: ...), puis relance la critique."
              className="text-sm"
            />
          </div>

          {/* AI proposes a corrected spec → the user edits & approves */}
          {bp.critique && !readOnly && (
            <div className="space-y-2">
              <Separator />
              <Button onClick={runPropose} disabled={busy === "propose"} variant="outline" className="gap-2">
                {busy === "propose" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                Proposer des corrections (IA)
              </Button>

              {proposal && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Changements proposés ({proposal.changes.length})</p>
                  {proposal.changes.length > 0 && (
                    <ul className="ml-4 list-disc space-y-0.5 text-sm">
                      {proposal.changes.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium">{c.title}</span>{" "}
                          {c.spec_path && <code className="text-muted-foreground text-xs">{c.spec_path}</code>} — {c.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  {proposal.notes && <p className="text-muted-foreground text-xs">{proposal.notes}</p>}
                  <label className="text-sm font-medium">Spec proposée (modifiable avant d&apos;approuver)</label>
                  <Textarea
                    value={proposedSpec}
                    onChange={(e) => setProposedSpec(e.target.value)}
                    rows={14}
                    className="font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={approveProposal} disabled={busy === "save"} className="gap-1.5">
                      <Check className="size-4" /> Approuver & remplacer la spec
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4-6. Manual artifact gates */}
      <ManualGate
        n={4}
        title="Faisabilité & sizing"
        desc="Estimation, registre de risques ; relié au devis CRM. Gate : faisable dans le budget/délai."
        value={feasibility}
        onChange={setFeasibility}
        onSave={() => savePatch({ feasibility }, "Faisabilité enregistrée")}
        gate="feasibility"
        on={bp.gates.feasibility}
        onToggle={toggleGate}
        readOnly={readOnly}
        saving={busy === "save"}
      />
      <ManualGate
        n={5}
        title="Conception de solution"
        desc="Stack approuvée, bounded contexts, modèle de données + index, intégrations/pannes, cache/async, SLO → SDD + ADRs + openapi.yaml + schéma DB."
        value={designDoc}
        onChange={setDesignDoc}
        onSave={() => savePatch({ designDoc }, "Design enregistré")}
        gate="design"
        on={bp.gates.design}
        onToggle={toggleGate}
        readOnly={readOnly}
        saving={busy === "save"}
      />
      <ManualGate
        n={6}
        title="Budgets & acceptance"
        desc="NFR → acceptance.yaml / QUALITY.md + budgets de latence + config des gates CI. Gate : seuils gelés."
        value={acceptanceYaml}
        onChange={setAcceptanceYaml}
        onSave={() => savePatch({ acceptanceYaml }, "Acceptance enregistrée")}
        gate="budgets"
        on={bp.gates.budgets}
        onToggle={toggleGate}
        readOnly={readOnly}
        saving={busy === "save"}
        mono
      />

      {/* 7. Prerequisites */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">7 · Pré-requis & provisioning</CardTitle>
            <GateBadge on={bp.gates.prereqs} />
          </div>
          <CardDescription>Gate : checklist verte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {PREREQ_ITEMS.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!bp.prereqs[item.key]}
                disabled={readOnly}
                onCheckedChange={(c) => setPrereq(item.key, c === true)}
              />
              {item.label}
            </label>
          ))}
        </CardContent>
      </Card>

      {/* 8. Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">8 · Plan & approbation</CardTitle>
            <GateBadge on={bp.gates.plan} />
          </div>
          <CardDescription>planFromArchitecture en preview — projets + backlog, sans rien créer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runPlan} disabled={readOnly || busy === "plan"} className="gap-2">
            {busy === "plan" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Générer le plan (preview)
          </Button>
          {bp.plan?.projects?.length ? (
            <div className="space-y-2">
              {bp.plan.projects.map((p) => (
                <div key={p.shortCode} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    {p.name} <Badge variant="secondary">{p.shortCode}</Badge>
                    <span className="text-muted-foreground text-xs">{p.tickets.length} tickets</span>
                  </div>
                  <ul className="text-muted-foreground mt-1 ml-4 list-disc text-xs">
                    {p.tickets.slice(0, 8).map((t) => (
                      <li key={t.ref}>
                        [{t.type}] {t.title} {t.points ? `· ${t.points}pt` : ""}
                      </li>
                    ))}
                    {p.tickets.length > 8 && <li>… +{p.tickets.length - 8}</li>}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Approve + Convert */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base">Approbation & création du workspace</CardTitle>
          <CardDescription>
            La création du workspace n&apos;est possible que depuis un Blueprint approuvé (toutes les gates vertes).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length > 0 && bp.status !== "CONVERTED" && (
            <p className="text-muted-foreground text-sm">
              Gates en attente : {pending.join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={approve}
              disabled={readOnly || bp.status === "APPROVED" || !canApprove(bp) || busy === "approve"}
              className="gap-2"
            >
              {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {bp.status === "APPROVED" ? "Approuvé" : "Approuver le Blueprint"}
            </Button>
            <Button
              onClick={convert}
              disabled={readOnly || bp.status !== "APPROVED" || !canCreateWorkspace || busy === "convert"}
              variant="default"
              className="gap-2"
            >
              {busy === "convert" ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              Créer le workspace
            </Button>
          </div>
          {!canCreateWorkspace && (
            <p className="text-muted-foreground text-xs">
              (La création de workspace requiert le droit <code>workspace.create</code>.)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ManualGate({
  n,
  title,
  desc,
  value,
  onChange,
  onSave,
  gate,
  on,
  onToggle,
  readOnly,
  saving,
  mono,
}: {
  n: number
  title: string
  desc: string
  value: string
  onChange: (v: string) => void
  onSave: () => void
  gate: GateKey
  on: boolean | undefined
  onToggle: (gate: GateKey, passed: boolean) => void
  readOnly: boolean
  saving: boolean
  mono?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {n} · {title}
          </CardTitle>
          <GateBadge on={on} />
        </div>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          rows={6}
          className={mono ? "font-mono text-xs" : "text-sm"}
        />
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
              Enregistrer
            </Button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!on} disabled={readOnly} onCheckedChange={(c) => onToggle(gate, c === true)} />
            Gate validée
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
