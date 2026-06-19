// Platform billing (Phase 5) — Stripe BILLING for the product subscription.
// SEPARATE from lib/stripe.ts (the user's own CRM invoicing of THEIR clients).
// REST API, no SDK — mirrors lib/stripe.ts.
//
// Env: STRIPE_BILLING_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET, STRIPE_PRICE_PRO, APP_URL.

import "server-only"
import { createHmac, timingSafeEqual } from "crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"

export function billingEnabled(): boolean {
  return !!process.env.STRIPE_BILLING_SECRET_KEY
}

// Per-seat subscription Checkout for an org. `seats` = billable members.
export async function createSubscriptionCheckout(opts: {
  orgId: string
  seats: number
  successUrl: string
  cancelUrl: string
  customerEmail?: string
}): Promise<{ url: string } | null> {
  if (!billingEnabled() || !process.env.STRIPE_PRICE_PRO) return null
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_PRO,
    "line_items[0][quantity]": String(Math.max(1, opts.seats)),
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    "metadata[orgId]": opts.orgId,
  })
  if (opts.customerEmail) body.set("customer_email", opts.customerEmail)
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_BILLING_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!res.ok) throw new Error(`Stripe billing error: ${await res.text()}`)
  const data = (await res.json()) as { url?: string }
  return data.url ? { url: data.url } : null
}

// Verify a Stripe webhook signature (scheme v1: HMAC-SHA256 of `${t}.${body}`).
export function verifyBillingSignature(raw: string, sigHeader: string | null): boolean {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET
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

// Upsert the org's subscription state from a webhook event.
export async function applySubscriptionState(
  orgId: string,
  s: {
    customerId?: string
    subscriptionId?: string
    plan?: string
    status?: string
    seats?: number
    periodEnd?: number
  }
): Promise<void> {
  await supabaseAdmin()
    .from("org_subscriptions")
    .upsert(
      {
        org_id: orgId,
        stripe_customer_id: s.customerId ?? null,
        stripe_subscription_id: s.subscriptionId ?? null,
        plan: s.plan ?? "pro",
        status: s.status ?? "active",
        seats: s.seats ?? 1,
        current_period_end: s.periodEnd ? new Date(s.periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" }
    )
  // Mirror the plan onto organizations for quick gating.
  await supabaseAdmin()
    .from("organizations")
    .update({ plan: s.plan ?? "pro" })
    .eq("id", orgId)
}
