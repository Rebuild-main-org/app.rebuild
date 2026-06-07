import type { FinanceDoc, Transaction } from "./types"

export function docSubtotal(doc: Pick<FinanceDoc, "items">): number {
  return doc.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}

export function docTotal(doc: Pick<FinanceDoc, "items" | "taxRate">): number {
  return Math.round(docSubtotal(doc) * (1 + doc.taxRate / 100))
}

export interface FinanceSummary {
  revenue: number
  expenses: number
  net: number
  outstanding: number // unpaid invoices total
}

export function summarize(
  transactions: Transaction[],
  docs: FinanceDoc[]
): FinanceSummary {
  const revenue = transactions
    .filter((t) => t.kind === "REVENUE")
    .reduce((s, t) => s + t.amount, 0)
  const expenses = transactions
    .filter((t) => t.kind === "EXPENSE")
    .reduce((s, t) => s + t.amount, 0)
  const outstanding = docs
    .filter((d) => d.kind === "INVOICE" && d.status !== "PAID" && d.status !== "REJECTED")
    .reduce((s, d) => s + docTotal(d), 0)
  return { revenue, expenses, net: revenue - expenses, outstanding }
}

export function formatMoney(amount: number, currency = "TND"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
