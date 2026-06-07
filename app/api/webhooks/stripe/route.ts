import { sb } from "@/lib/data"
import { verifyStripeSignature } from "@/lib/stripe"

// POST /api/webhooks/stripe — marks an invoice PAID on checkout completion.
// Public route (verified by Stripe signature). Add to middleware PUBLIC_PREFIXES
// is unnecessary: /api/webhooks is already exempt.
export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 })
  }
  const raw = await request.text()
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 })
  }
  const event = JSON.parse(raw) as {
    type: string
    data: { object: { metadata?: { invoiceId?: string }; client_reference_id?: string } }
  }
  if (event.type === "checkout.session.completed") {
    const obj = event.data.object
    const invoiceId = obj.metadata?.invoiceId ?? obj.client_reference_id
    if (invoiceId) {
      await sb()
        .from("finance_docs")
        .update({ status: "PAID" })
        .eq("id", invoiceId)
    }
  }
  return Response.json({ received: true })
}
