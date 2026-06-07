import { notFound } from "next/navigation"
import { Sparkles } from "lucide-react"

import { SEL, sb } from "@/lib/data"
import { verifyPortalToken } from "@/lib/portal"
import { projectProgress, projectsForWorkspace } from "@/lib/queries"
import type { FinanceDoc, Milestone, User, Workspace } from "@/lib/types"
import { TeamChat } from "@/components/chat/team-chat"
import { MilestoneValidation } from "@/components/client/milestone-validation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

// The portal is reached via app.rebuild.tn/client/[token]. For this demo the
// token resolves to a workspace id or slug; in production it's a signed token.
export default async function ClientPortal({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // Fix C: the token is an HMAC-signed workspace id, not a guessable slug.
  const wsId = verifyPortalToken(token)
  if (!wsId) notFound()
  const { data: wsRow } = await sb()
    .from("workspaces")
    .select(SEL.workspace)
    .eq("id", wsId)
    .maybeSingle()
  const ws = wsRow as Workspace | null
  if (!ws) notFound()

  const projects = await projectsForWorkspace(ws.id)
  const progresses = await Promise.all(projects.map((p) => projectProgress(p.id)))
  const overall =
    progresses.length === 0
      ? 0
      : Math.round(progresses.reduce((s, n) => s + n, 0) / progresses.length)

  const projectIds = projects.map((p) => p.id)
  let milestones: Milestone[] = []
  if (projectIds.length) {
    const { data } = await sb()
      .from("milestones")
      .select(SEL.milestone)
      .in("project_id", projectIds)
      .order("due_date")
    milestones = (data ?? []) as Milestone[]
  }
  const nextDelivery = milestones.find((m) => !m.done)
  // Fix C: resolve THIS workspace's client by its client_email, not the first
  // CLIENT in the directory (which mixed clients together).
  const { data: clientRow } = await sb()
    .from("users")
    .select(SEL.user)
    .ilike("email", ws.clientEmail)
    .maybeSingle()
  const clientUser = clientRow as User | null

  // Invoices for this workspace (read-only for the client).
  const { data: invoiceRows } = await sb()
    .from("finance_docs")
    .select(SEL.financeDoc)
    .eq("workspace_id", ws.id)
    .eq("kind", "INVOICE")
    .order("issue_date", { ascending: false })
  const invoices = (invoiceRows ?? []) as FinanceDoc[]
  const invoiceTotal = (inv: FinanceDoc) => {
    const sub = inv.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
    return sub * (1 + (inv.taxRate ?? 0) / 100)
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded font-bold">
            R
          </div>
          <div>
            <div className="text-sm font-semibold">{ws.name}</div>
            <div className="text-muted-foreground text-xs">
              Client portal · REBUILD
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Project progress</CardTitle>
            <CardDescription>
              Overall completion based on delivered milestones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <span className="text-4xl font-semibold">{overall}%</span>
              {nextDelivery && (
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">Next delivery</div>
                  <div className="font-medium">{nextDelivery.title}</div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(nextDelivery.dueDate).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
            <Progress value={overall} />
            <div className="bg-primary/5 border-primary/20 flex items-start gap-2 rounded-md border p-3 text-sm">
              <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
              <span>
                Your team is actively working on the billing dashboard and
                onboarding flow. A preview link will be shared this week.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Milestones & deliverables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {milestones.map((m) => (
              <MilestoneValidation
                key={m.id}
                token={token}
                milestone={{
                  id: m.id,
                  title: m.title,
                  description: m.description,
                  done: m.done,
                  validatedByClient: m.validatedByClient,
                  clientFeedback: m.clientFeedback,
                }}
              />
            ))}
          </CardContent>
        </Card>

        {invoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Your billing documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{inv.number}</div>
                    <div className="text-muted-foreground text-xs">
                      Issued {new Date(inv.issueDate).toLocaleDateString()} · due{" "}
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {invoiceTotal(inv).toLocaleString(undefined, {
                        style: "currency",
                        currency: inv.currency || "EUR",
                      })}
                    </div>
                    <div className="text-muted-foreground text-xs">{inv.status}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Message your team</CardTitle>
            <CardDescription>
              Direct line to the REBUILD engineers on your project.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[420px] p-0">
            {clientUser && (
              <TeamChat workspaceId={ws.id} currentUserId={clientUser.id} />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
