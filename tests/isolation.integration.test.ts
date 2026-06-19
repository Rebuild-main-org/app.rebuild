// ============================================================================
// Cross-tenant isolation harness (the "Phase 0.5" regression net).
// ============================================================================
// Proves on a REAL Postgres that a member of org A can neither READ nor WRITE
// org B's rows, across every tenant table converted to RLS. SKIPPED unless a
// disposable test project is wired, so it never blocks `npm run test`.
//
// To run:
//   1. Apply supabase/org-foundation.sql + rls-finance.sql + rls-all-domains.sql
//      to a test DB.
//   2. Create two orgs; put test user A in org A, user B in org B.
//   3. Export:
//        SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY,
//        SUPABASE_TEST_USER_A="email:password"  (member of org A)
//        SUPABASE_TEST_USER_B="email:password"  (member of org B)
//   4. npx vitest run tests/isolation.integration.test.ts
//
// Adding a new domain to the backstop? Add a row factory below — its isolation
// is then proven automatically.

import { describe, it, expect, beforeAll } from "vitest"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const URL = process.env.SUPABASE_TEST_URL
const ANON = process.env.SUPABASE_TEST_ANON_KEY
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
const USER_A = process.env.SUPABASE_TEST_USER_A
const USER_B = process.env.SUPABASE_TEST_USER_B

const configured = !!(URL && ANON && SERVICE && USER_A && USER_B)

async function signedInClient(creds: string): Promise<SupabaseClient> {
  const [email, password] = creds.split(":")
  const c = createClient(URL!, ANON!)
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return c
}

// Minimal valid row per tenant table (+ the org stamp). One entry per domain.
type RowFactory = (orgId: string) => Record<string, unknown> & { id: string }
const TABLES: { table: string; row: RowFactory }[] = [
  {
    table: "finance_docs",
    row: (orgId) => ({
      id: crypto.randomUUID(), org_id: orgId, kind: "INVOICE", number: `T-${Date.now()}`,
      client_name: "B", issue_date: new Date().toISOString(), due_date: new Date().toISOString(),
      status: "DRAFT", items: [{ label: "x", qty: 1, unitPrice: 1 }], tax_rate: 19, currency: "TND",
    }),
  },
  {
    table: "leads",
    row: (orgId) => ({
      id: crypto.randomUUID(), org_id: orgId, company: "B Co", contact_name: "", contact_email: "",
      stage: "LEAD", value: 0, currency: "TND", source: "", owner_id: crypto.randomUUID(),
    }),
  },
  {
    table: "transactions",
    row: (orgId) => ({
      id: crypto.randomUUID(), org_id: orgId, kind: "EXPENSE", label: "x", category: "General",
      amount: 1, date: new Date().toISOString(),
    }),
  },
]

describe.skipIf(!configured)("cross-tenant isolation (RLS)", () => {
  let admin: SupabaseClient
  let clientA: SupabaseClient
  let orgB: string

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!) // bypasses RLS — used only to seed
    clientA = await signedInClient(USER_A!)
    const { data } = await admin
      .from("organization_members")
      .select("org_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    orgB = (data?.org_id as string) ?? ""
    expect(orgB).not.toBe("")
  })

  for (const { table, row } of TABLES) {
    it(`${table}: A cannot READ org B's rows`, async () => {
      const seeded = row(orgB)
      const ins = await admin.from(table).insert(seeded).select("id").single()
      expect(ins.error).toBeNull()
      const { data } = await clientA.from(table).select("id").eq("id", seeded.id)
      expect(data ?? []).toHaveLength(0) // RLS filters the row out entirely
    })

    it(`${table}: A cannot WRITE into org B (insert policy rejects)`, async () => {
      const { error } = await clientA.from(table).insert(row(orgB))
      expect(error).not.toBeNull() // row-level security violation
    })
  }
})

// Make an un-wired run loud rather than silently "passing".
describe("isolation harness configuration", () => {
  it(configured ? "is configured" : "is SKIPPED (set SUPABASE_TEST_* to enable)", () => {
    expect(true).toBe(true)
  })
})
