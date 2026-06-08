import { redirect } from "next/navigation"
import { ArrowDownRight, ArrowUpRight, Receipt, Wallet } from "lucide-react"

import { getSessionUser } from "@/lib/auth/session"
import { can, isAdmin } from "@/lib/auth"
import { SEL, sb } from "@/lib/data"
import { docTotal, formatMoney, summarize } from "@/lib/finance"
import { aiUsageSummary } from "@/lib/ai-usage"
import { AI_MODELS, DEFAULT_AI_MODEL, getAiModel, getCliModel } from "@/lib/settings"
import type { FinanceDoc, Transaction } from "@/lib/types"
import { NewFinanceDoc } from "@/components/admin/new-finance-doc"
import { NewTransaction } from "@/components/admin/new-transaction"
import { FinanceStatus } from "@/components/admin/finance-status"
import { FinanceDelete } from "@/components/admin/finance-delete"
import { UserManagement } from "@/components/admin/user-management"
import { AgentDocsEditor } from "@/components/admin/agent-docs-editor"
import { AgentsManager } from "@/components/admin/agents-manager"
import { NotifyBroadcast } from "@/components/admin/notify-broadcast"
import { TransactionActions } from "@/components/admin/transaction-actions"
import { PermissionsMatrix } from "@/components/admin/permissions-matrix"
import { AiModelSetting } from "@/components/admin/ai-model-setting"
import { Reveal } from "@/components/motion/reveal"
import { CountUp } from "@/components/motion/count-up"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function AdminPage() {
  const user = await getSessionUser()
  if (!user || !can(user, "admin.panel")) redirect("/dashboard")

  const [{ data: docsData }, { data: txnData }] = await Promise.all([
    sb().from("finance_docs").select(SEL.financeDoc).order("issue_date", { ascending: false }),
    sb().from("transactions").select(SEL.transaction).order("date", { ascending: false }),
  ])
  const docs = (docsData ?? []) as FinanceDoc[]
  const txns = (txnData ?? []) as Transaction[]
  const aiUse = isAdmin(user.role) ? await aiUsageSummary() : null
  const canDeleteFinance = can(user, "billing.delete")
  const isSuperAdmin = user.role === "SUPER_ADMIN"
  const aiModel = isSuperAdmin ? await getAiModel() : null
  const cliModel = isSuperAdmin ? await getCliModel() : null
  const s = summarize(txns, docs)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin panel</h1>
        <p className="text-muted-foreground text-sm">
          Devis, factures et gestion des charges &amp; revenus.
        </p>
      </div>

      {/* KPIs */}
      <Reveal className="grid gap-4 sm:grid-cols-4">
        <Kpi icon={<ArrowUpRight className="size-4" />} label="Revenue" value={s.revenue} tone="text-emerald-600 dark:text-emerald-400" />
        <Kpi icon={<ArrowDownRight className="size-4" />} label="Expenses" value={s.expenses} tone="text-red-600 dark:text-red-400" />
        <Kpi icon={<Wallet className="size-4" />} label="Net" value={s.net} tone={s.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
        <Kpi icon={<Receipt className="size-4" />} label="Outstanding invoices" value={s.outstanding} tone="text-amber-600 dark:text-amber-400" />
      </Reveal>

      {/* Users */}
      <Card>
        <CardHeader>
          <CardTitle>Users &amp; access</CardTitle>
        </CardHeader>
        <CardContent>
          <UserManagement />
        </CardContent>
      </Card>

      {/* AI Agents library (admins + super-admins) */}
      {isAdmin(user.role) && (
        <Card>
          <CardHeader>
            <CardTitle>AI Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentsManager />
          </CardContent>
        </Card>
      )}

      {/* AI model — global switch (super admin only) */}
      {isSuperAdmin && aiModel && (
        <Card>
          <CardHeader>
            <CardTitle>Modèle IA (plateforme)</CardTitle>
            <CardDescription>
              Le modèle Claude utilisé par toute l&apos;IA serveur (revue, triage, scaffold,
              copilote…). Le changement s&apos;applique immédiatement à <strong>tous</strong> les
              utilisateurs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiModelSetting field="aiModel" current={aiModel} models={AI_MODELS} defaultModel={DEFAULT_AI_MODEL} />
          </CardContent>
        </Card>
      )}

      {/* AI model — CLI/agent engine (super admin only) */}
      {isSuperAdmin && cliModel && (
        <Card>
          <CardHeader>
            <CardTitle>Modèle IA (CLI)</CardTitle>
            <CardDescription>
              Le modèle Claude utilisé par toute l&apos;IA CLI (moteur de l&apos;agent
              rebuild216 : livraison autonome, chat). Le changement s&apos;applique au prochain
              lancement, pour <strong>tous</strong> les utilisateurs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiModelSetting field="cliModel" current={cliModel} models={AI_MODELS} defaultModel={DEFAULT_AI_MODEL} />
          </CardContent>
        </Card>
      )}

      {/* AI governance — usage & cost (admins) */}
      {aiUse && (
        <Card>
          <CardHeader>
            <CardTitle>AI usage &amp; cost — this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-2xl font-semibold">${aiUse.monthCostUsd.toFixed(2)}</div>
                <div className="text-muted-foreground text-xs">Spend this month</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{aiUse.monthCalls}</div>
                <div className="text-muted-foreground text-xs">AI calls</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{(aiUse.monthTokens / 1000).toFixed(0)}k</div>
                <div className="text-muted-foreground text-xs">Tokens</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">${aiUse.cap.toFixed(0)}</div>
                <div className="text-muted-foreground text-xs">Per-user monthly cap</div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Per-workspace tokens & cost. */}
              {aiUse.byWorkspace.length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">By workspace</div>
                  <ul className="space-y-1 text-sm">
                    {aiUse.byWorkspace.map((w) => (
                      <li key={w.workspaceId} className="flex justify-between gap-2">
                        <span className="truncate">{w.name}</span>
                        <span className="text-muted-foreground tabular-nums">${w.costUsd.toFixed(2)} · {(w.tokens / 1000).toFixed(0)}k</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiUse.byFeature.length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">By feature</div>
                  <ul className="space-y-1 text-sm">
                    {aiUse.byFeature.map((f) => (
                      <li key={f.feature} className="flex justify-between gap-2">
                        <span className="truncate font-mono text-xs">{f.feature}</span>
                        <span className="text-muted-foreground tabular-nums">${f.costUsd.toFixed(2)} · {(f.tokens / 1000).toFixed(0)}k</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Per-user breakdown (names) is sensitive → SUPER_ADMIN only. */}
              {user.role === "SUPER_ADMIN" && aiUse.topUsers.length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">Top users</div>
                  <ul className="space-y-1 text-sm">
                    {aiUse.topUsers.map((u) => (
                      <li key={u.userId} className="flex justify-between gap-2">
                        <span className="truncate">{u.name}</span>
                        <span className="text-muted-foreground tabular-nums">${u.costUsd.toFixed(2)} · {(u.tokens / 1000).toFixed(0)}k</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Per-user monthly cap is <code>AI_MONTHLY_BUDGET_USD</code> (default $25); admins are exempt.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Section permissions matrix (super-admin only) */}
      {user.role === "SUPER_ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle>Role permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <PermissionsMatrix />
          </CardContent>
        </Card>
      )}

      {/* Broadcast notifications by role (super-admin only) */}
      {can(user, "notify.broadcast") && (
        <Card>
          <CardHeader>
            <CardTitle>Push a notification</CardTitle>
          </CardHeader>
          <CardContent>
            <NotifyBroadcast />
          </CardContent>
        </Card>
      )}

      {/* rebuild216 agent docs */}
      <Card>
        <CardHeader>
          <CardTitle>rebuild216 agent — soul &amp; skills</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentDocsEditor />
        </CardContent>
      </Card>

      {/* Devis & Factures */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Devis &amp; factures</CardTitle>
            <NewFinanceDoc />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                {canDeleteFinance && <TableHead className="w-10 text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.number}</TableCell>
                  <TableCell>
                    <Badge variant={d.kind === "INVOICE" ? "default" : "secondary"}>
                      {d.kind === "INVOICE" ? "Facture" : "Devis"}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.clientName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(d.issueDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(docTotal(d), d.currency)}
                  </TableCell>
                  <TableCell>
                    <FinanceStatus id={d.id} status={d.status} />
                  </TableCell>
                  {canDeleteFinance && (
                    <TableCell className="text-right">
                      <FinanceDelete id={d.id} number={d.number} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Charges & Revenus */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Charges &amp; revenus</CardTitle>
            <NewTransaction />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(t.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium">{t.label}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {t.category}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        t.kind === "REVENUE"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {t.kind === "REVENUE" ? "Revenu" : "Charge"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {t.kind === "EXPENSE" ? "−" : "+"}
                    {formatMoney(t.amount)}
                  </TableCell>
                  <TableCell>
                    <TransactionActions txn={t} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-1.5 text-xs ${tone}`}>
          {icon} {label}
        </div>
        <div className="mt-1 text-xl font-semibold">
          <CountUp value={value} money />
        </div>
      </CardContent>
    </Card>
  )
}
