import { verifyBillingSignature, applySubscriptionState } from "@/lib/billing"

export const dynamic = "force-dynamic"

// POST /api/webhooks/stripe-billing — platform subscription lifecycle. Distinct
// from the CRM invoice webhook; verified with STRIPE_BILLING_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyBillingSignature(raw, request.headers.get("stripe-signature"))) {
    return Response.json({ error: "bad signature" }, { status: 400 })
  }
  const event = JSON.parse(raw) as { type: string; data: { object: unknown } }
  const obj = (event.data?.object ?? {}) as {
    metadata?: { orgId?: string }
    client_reference_id?: string
    customer?: string
    subscription?: string
    id?: string
    status?: string
    quantity?: number
    current_period_end?: number
    items?: { data?: { quantity?: number }[] }
  }
  const orgId = obj.metadata?.orgId ?? obj.client_reference_id

  if (
    orgId &&
    (event.type.startsWith("customer.subscription") || event.type === "checkout.session.completed")
  ) {
    await applySubscriptionState(orgId, {
      customerId: obj.customer,
      subscriptionId: obj.subscription ?? obj.id,
      plan: "pro",
      status: obj.status ?? "active",
      seats: obj.quantity ?? obj.items?.data?.[0]?.quantity ?? 1,
      periodEnd: obj.current_period_end,
    })
  }
  return Response.json({ received: true })
}
