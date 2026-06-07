import { requireAuth } from "@/lib/auth/guard"
import { SEL, sb } from "@/lib/data"
import { docTotal } from "@/lib/finance"
import { appUrl } from "@/lib/email"
import { createCheckoutSession, stripeEnabled } from "@/lib/stripe"
import type { FinanceDoc } from "@/lib/types"

// POST /api/finance/:id/checkout — create a Stripe Checkout link for an invoice.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth("billing.manage")
  if (auth instanceof Response) return auth
  if (!stripeEnabled()) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 })
  }
  const { id } = await params
  const { data } = await sb().from("finance_docs").select(SEL.financeDoc).eq("id", id).maybeSingle()
  const doc = data as FinanceDoc | null
  if (!doc || doc.kind !== "INVOICE") {
    return Response.json({ error: "Invoice not found" }, { status: 404 })
  }
  if (doc.status === "PAID") return Response.json({ error: "Already paid" }, { status: 409 })

  try {
    const session = await createCheckoutSession({
      amount: docTotal(doc),
      currency: doc.currency || "EUR",
      description: `Invoice ${doc.number} — ${doc.clientName}`,
      invoiceId: doc.id,
      successUrl: appUrl(`/admin?paid=${doc.id}`),
      cancelUrl: appUrl(`/admin`),
    })
    if (!session) return Response.json({ error: "Could not create session" }, { status: 502 })
    return Response.json({ url: session.url })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 })
  }
}
