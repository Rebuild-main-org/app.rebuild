-- ============================================================================
-- Phase 5 — Platform billing (Stripe Billing for the product subscription)
-- ============================================================================
-- SEPARATE from the CRM Stripe in lib/stripe.ts (which is the user's OWN
-- invoicing of THEIR clients). One subscription per org. Run after org-foundation.sql.
create table if not exists org_subscriptions (
  org_id                 uuid primary key references organizations(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text not null default 'free',     -- free | pro
  status                 text not null default 'inactive', -- active|trialing|past_due|canceled|inactive
  seats                  int  not null default 1,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
alter table org_subscriptions enable row level security;
alter table org_subscriptions force  row level security;
drop policy if exists org_subs_member_select on org_subscriptions;
create policy org_subs_member_select on org_subscriptions
  for select using (org_id in (select current_user_org_ids()));
grant select on org_subscriptions to authenticated;
