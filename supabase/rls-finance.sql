-- ============================================================================
-- Phase 1 — Vertical slice #1: Finance under real RLS  (TEMPLATE for the rest)
-- ============================================================================
-- Run AFTER org-foundation.sql. This is the pattern every other domain copies:
--   1. lock the tenant column        -> org_id NOT NULL (backfill already filled it)
--   2. enable + FORCE row level security
--   3. one policy family: a row is visible/writable IFF the caller is a member
--      of its org  (via current_user_org_ids(), defined in org-foundation.sql)
--
-- The SCOPED client (lib/supabase/server.ts: anon key + auth cookie) sends the
-- user's JWT, so auth.uid() is set and these policies apply. The SERVICE-ROLE
-- client (lib/supabase/admin.ts) keeps BYPASSRLS — reserved for cron / webhooks
-- / platform admin, which must pass an explicit org_id filter of their own.

do $$
begin
  if to_regclass('finance_docs') is null then
    raise notice 'finance_docs absent — skipping Finance RLS slice';
    return;
  end if;
  -- 1. Lock the tenant column (org-foundation.sql backfilled every row).
  alter table finance_docs alter column org_id set not null;
end $$;

-- 2. Enable + force RLS. FORCE so even the table owner is subject to policies;
--    only a role with BYPASSRLS (service_role) escapes.
alter table finance_docs enable row level security;
alter table finance_docs force  row level security;

-- 3. Tenant-isolation policies (drop-and-recreate => idempotent).
drop policy if exists finance_docs_tenant_select on finance_docs;
create policy finance_docs_tenant_select on finance_docs
  for select using (org_id in (select current_user_org_ids()));

drop policy if exists finance_docs_tenant_insert on finance_docs;
create policy finance_docs_tenant_insert on finance_docs
  for insert with check (org_id in (select current_user_org_ids()));

drop policy if exists finance_docs_tenant_update on finance_docs;
create policy finance_docs_tenant_update on finance_docs
  for update using      (org_id in (select current_user_org_ids()))
             with check (org_id in (select current_user_org_ids()));

drop policy if exists finance_docs_tenant_delete on finance_docs;
create policy finance_docs_tenant_delete on finance_docs
  for delete using (org_id in (select current_user_org_ids()));
