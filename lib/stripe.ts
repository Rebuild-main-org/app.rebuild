// Stripe integration (COULD) — hosted Checkout for invoice payment. Uses the
// REST API directly (no SDK). No-op unless STRIPE_SECRET_KEY is set.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_URL.

import "server-only"
import { createHmac, timingSafeEqual } from "crypto"

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

// Create a Checkout Session for a one-off invoice payment. `amount` is in the
// currency's major unit (e.g. euros); converted to the smallest unit here.
export async function createCheckoutSession(opts: {
  amount: number
  currency: string
  description: string
  invoiceId: string
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string } | null> {
  if (!stripeEnabled()) return null
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": opts.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": opts.description,
    "line_items[0][price_data][unit_amount]": String(Math.round(opts.amount * 100)),
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    "metadata[invoiceId]": opts.invoiceId,
    client_reference_id: opts.invoiceId,
  })
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!res.ok) throw new Error(`Stripe error: ${await res.text()}`)
  const data = (await res.json()) as { url?: string }
  return data.url ? { url: data.url } : null
}

// Verify a Stripe webhook signature (scheme v1: HMAC-SHA256 of `${t}.${body}`).
export function verifyStripeSignature(raw: string, sigHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !sigHeader) return false
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")))
  const t = parts["t"]
  const v1 = parts["v1"]
  if (!t || !v1) return false
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
  } catch {
    return false
  }
}
