import { requireAuth, requireProject } from "@/lib/auth/guard"
import { SEL, getUsersMap, sb } from "@/lib/data"
import { ticketsForProject } from "@/lib/queries"
import { toCsv } from "@/lib/csv"
import { docTotal } from "@/lib/finance"
import type { FinanceDoc, Lead, Ticket, Transaction } from "@/lib/types"

export const dynamic = "force-dynamic"

function csvResponse(name: string, csv: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

// GET /api/export?entity=tickets|leads|transactions|invoices[&projectId=]
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const entity = searchParams.get("entity")

  if (entity === "tickets") {
    const projectId = searchParams.get("projectId")
    const access = await requireProject(projectId ?? undefined)
    if (access instanceof Response) return access
    const [tickets, users] = await Promise.all([ticketsForProject(projectId!), getUsersMap()])
    const rows = (tickets as Ticket[]).map((t) => ({
      shortId: t.shortId,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      assignee: t.assigneeId ? (users.get(t.assigneeId)?.name ?? "") : "",
      points: t.points ?? "",
      labels: t.labels,
      dueDate: t.dueDate ?? "",
      createdAt: t.createdAt,
    }))
    const csv = toCsv(rows, [
      { key: "shortId", label: "Key" },
      { key: "title", label: "Title" },
      { key: "type", label: "Type" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "assignee", label: "Assignee" },
      { key: "points", label: "Points" },
      { key: "labels", label: "Labels" },
      { key: "dueDate", label: "Due" },
      { key: "createdAt", label: "Created" },
    ])
    return csvResponse("tickets", csv)
  }

  if (entity === "leads") {
    const access = await requireAuth("crm.view")
    if (access instanceof Response) return access
    const { data } = await sb().from("leads").select(SEL.lead).order("created_at", { ascending: false })
    const csv = toCsv(
      (data ?? []) as Lead[],
      [
        { key: "company", label: "Company" },
        { key: "contactName", label: "Contact" },
        { key: "contactEmail", label: "Email" },
        { key: "stage", label: "Stage" },
        { key: "value", label: "Value" },
        { key: "currency", label: "Currency" },
        { key: "source", label: "Source" },
        { key: "createdAt", label: "Created" },
      ] as { key: keyof Lead; label: string }[],
    )
    return csvResponse("leads", csv)
  }

  if (entity === "transactions") {
    const access = await requireAuth("billing.manage")
    if (access instanceof Response) return access
    const { data } = await sb().from("transactions").select(SEL.transaction).order("date", { ascending: false })
    const csv = toCsv(
      (data ?? []) as Transaction[],
      [
        { key: "date", label: "Date" },
        { key: "kind", label: "Kind" },
        { key: "label", label: "Label" },
        { key: "category", label: "Category" },
        { key: "amount", label: "Amount" },
      ] as { key: keyof Transaction; label: string }[],
    )
    return csvResponse("transactions", csv)
  }

  if (entity === "invoices") {
    const access = await requireAuth("billing.manage")
    if (access instanceof Response) return access
    const { data } = await sb().from("finance_docs").select(SEL.financeDoc).eq("kind", "INVOICE").order("issue_date", { ascending: false })
    const rows = ((data ?? []) as FinanceDoc[]).map((d) => ({
      number: d.number,
      clientName: d.clientName,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      status: d.status,
      total: docTotal(d),
      currency: d.currency,
    }))
    const csv = toCsv(rows, [
      { key: "number", label: "Number" },
      { key: "clientName", label: "Client" },
      { key: "issueDate", label: "Issued" },
      { key: "dueDate", label: "Due" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total" },
      { key: "currency", label: "Currency" },
    ])
    return csvResponse("invoices", csv)
  }

  return Response.json({ error: "Unknown entity" }, { status: 400 })
}
