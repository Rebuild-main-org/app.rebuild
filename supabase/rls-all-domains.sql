-- ============================================================================
-- Phase 1 — Tenant RLS backstop for ALL remaining root domains
-- ============================================================================
-- Run AFTER org-foundation.sql (it defines current_user_org_ids() and backfills
-- org_id). This applies the Finance template (rls-finance.sql) to every other
-- root table in one idempotent pass.
--
-- IMPORTANT — why org_id stays NULLABLE here:
--   Setting org_id NOT NULL on a table whose write routes don't yet stamp org_id
--   would break those inserts. So NOT NULL is locked PER DOMAIN, only once its
--   routes are converted to the scoped client (as Finance already is). Until
--   then RLS is the backstop: the service-role client keeps BYPASSRLS for
--   cron/webhooks/admin, while any route already on the scoped client is
--   tenant-isolated by these policies. A scoped INSERT with a NULL/foreign
--   org_id fails the WITH CHECK, which is exactly what we want.

do $$
declare
  t text;
  tables text[] := array[
    'workspaces','transactions','documents','meetings','messages',
    'audit_logs','leads','support_tickets','ai_usage','cli_tokens'
  ];
begin
  foreach t in array tables loop
    if to_regclass(t) is null then
      raise notice '% absent — skipping', t;
      continue;
    end if;

    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);

    execute format('drop policy if exists %I on %I', t||'_tenant_select', t);
    execute format(
      'create policy %I on %I for select using (org_id in (select current_user_org_ids()))',
      t||'_tenant_select', t);

    execute format('drop policy if exists %I on %I', t||'_tenant_insert', t);
    execute format(
      'create policy %I on %I for insert with check (org_id in (select current_user_org_ids()))',
      t||'_tenant_insert', t);

    execute format('drop policy if exists %I on %I', t||'_tenant_update', t);
    execute format(
      'create policy %I on %I for update using (org_id in (select current_user_org_ids())) with check (org_id in (select current_user_org_ids()))',
      t||'_tenant_update', t);

    execute format('drop policy if exists %I on %I', t||'_tenant_delete', t);
    execute format(
      'create policy %I on %I for delete using (org_id in (select current_user_org_ids()))',
      t||'_tenant_delete', t);
  end loop;
end $$;

-- Per-domain NOT NULL locks (uncomment a line once that domain's write routes
-- stamp org_id — see the route conversions in app/api/**):
--   alter table leads          alter column org_id set not null;
--   alter table documents      alter column org_id set not null;
--   alter table support_tickets alter column org_id set not null;
--   alter table transactions   alter column org_id set not null;
--   alter table messages       alter column org_id set not null;
--   alter table meetings       alter column org_id set not null;
--   alter table workspaces     alter column org_id set not null;
