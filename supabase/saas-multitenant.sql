-- ============================================================================
-- REBUILD → SaaS multi-tenant — consolidated migration (Phases 0-5)
-- ============================================================================
-- Apply once, in this order, against your Supabase Postgres. Idempotent: safe to
-- re-run. Equivalent to applying, in order:
--   org-foundation.sql, rls-finance.sql, rls-all-domains.sql, rbac.sql,
--   byok-and-settings.sql, onboarding.sql, billing.sql
--
-- After applying, seed yourself as a platform admin:
--   insert into platform_admins(user_id) values ('<your-auth-uid>');
-- ============================================================================


-- ====================  PHASE 0 — Tenant foundation  =========================

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

create table if not exists organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null,
  role        text not null default 'member'
              check (role in ('owner','admin','member','guest')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_org_members_user on organization_members(user_id);
create index if not exists idx_org_members_org  on organization_members(org_id);

-- Shared helper used by every tenant RLS policy. SECURITY DEFINER avoids
-- recursing into organization_members' own RLS.
create or replace function current_user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

-- Add org_id (NULLABLE) to every root entity + index. Guarded for absent tables.
do $$
declare
  t text;
  root_tables text[] := array[
    'workspaces','finance_docs','transactions','documents','meetings',
    'messages','audit_logs','leads','support_tickets','ai_usage','cli_tokens'
  ];
begin
  foreach t in array root_tables loop
    if to_regclass(t) is not null then
      execute format('alter table %I add column if not exists org_id uuid references organizations(id)', t);
      execute format('create index if not exists %I on %I(org_id)', 'idx_'||t||'_org', t);
    end if;
  end loop;
end $$;

-- Backfill: one "legacy" org; all existing profiles + rows attached to it.
do $$
declare
  legacy_org uuid;
  t text;
  root_tables text[] := array[
    'workspaces','finance_docs','transactions','documents','meetings',
    'messages','audit_logs','leads','support_tickets','ai_usage','cli_tokens'
  ];
begin
  select id into legacy_org from organizations where slug = 'legacy';
  if legacy_org is null then
    insert into organizations (name, slug) values ('Legacy', 'legacy') returning id into legacy_org;
  end if;

  if to_regclass('profiles') is not null then
    insert into organization_members (org_id, user_id, role)
    select legacy_org, p.id,
           case
             when p.role = 'SUPER_ADMIN' then 'owner'
             when p.role = 'ADMIN'       then 'admin'
             when p.role = 'CLIENT'      then 'guest'
             else 'member'
           end
    from profiles p
    on conflict (org_id, user_id) do nothing;
  end if;

  foreach t in array root_tables loop
    if to_regclass(t) is not null then
      execute format('update %I set org_id = %L where org_id is null', t, legacy_org);
    end if;
  end loop;
end $$;

-- RLS on the tenant tables themselves (writes go through service-role for now).
alter table organizations        enable row level security;
alter table organization_members enable row level security;

drop policy if exists org_members_self_select on organization_members;
create policy org_members_self_select on organization_members
  for select using (user_id = auth.uid());

drop policy if exists organizations_member_select on organizations;
create policy organizations_member_select on organizations
  for select using (id in (select current_user_org_ids()));

grant select on organizations        to authenticated;
grant select on organization_members to authenticated;


-- ====================  PHASE 1 — Finance slice (template)  ===================

do $$
begin
  if to_regclass('finance_docs') is not null then
    alter table finance_docs alter column org_id set not null;
  end if;
end $$;

alter table finance_docs enable row level security;
alter table finance_docs force  row level security;

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


-- ====================  PHASE 1 — RLS backstop, all domains  ==================
-- org_id stays NULLABLE here; lock NOT NULL per-domain once its write routes
-- stamp org_id (see the commented locks at the end).

do $$
declare
  t text;
  tables text[] := array[
    'workspaces','transactions','documents','meetings','messages',
    'audit_logs','leads','support_tickets','ai_usage','cli_tokens'
  ];
begin
  foreach t in array tables loop
    if to_regclass(t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);
    execute format('drop policy if exists %I on %I', t||'_tenant_select', t);
    execute format('create policy %I on %I for select using (org_id in (select current_user_org_ids()))', t||'_tenant_select', t);
    execute format('drop policy if exists %I on %I', t||'_tenant_insert', t);
    execute format('create policy %I on %I for insert with check (org_id in (select current_user_org_ids()))', t||'_tenant_insert', t);
    execute format('drop policy if exists %I on %I', t||'_tenant_update', t);
    execute format('create policy %I on %I for update using (org_id in (select current_user_org_ids())) with check (org_id in (select current_user_org_ids()))', t||'_tenant_update', t);
    execute format('drop policy if exists %I on %I', t||'_tenant_delete', t);
    execute format('create policy %I on %I for delete using (org_id in (select current_user_org_ids()))', t||'_tenant_delete', t);
  end loop;
end $$;


-- ====================  PHASE 2 — RBAC  ======================================

create table if not exists platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security; -- service-role only

alter table organizations add column if not exists developer_mode boolean not null default false;

create table if not exists member_capabilities (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null,
  capability text not null,
  granted    boolean not null default true,
  primary key (org_id, user_id, capability)
);
alter table member_capabilities enable row level security;
drop policy if exists member_caps_select on member_capabilities;
create policy member_caps_select on member_capabilities
  for select using (org_id in (select current_user_org_ids()));
grant select on member_capabilities to authenticated;


-- ====================  PHASE 3 — BYOK vault, settings, GitHub App  ===========

create table if not exists org_secrets (
  org_id       uuid not null references organizations(id) on delete cascade,
  provider     text not null,
  ciphertext   text not null,
  last4        text,
  health       text not null default 'unknown',
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (org_id, provider)
);
alter table org_secrets enable row level security;
alter table org_secrets force  row level security;
drop policy if exists org_secrets_member_select on org_secrets;
create policy org_secrets_member_select on org_secrets
  for select using (org_id in (select current_user_org_ids()));
grant select on org_secrets to authenticated;

create table if not exists org_settings (
  org_id     uuid not null references organizations(id) on delete cascade,
  key        text not null,
  value      text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table org_settings enable row level security;
alter table org_settings force  row level security;
drop policy if exists org_settings_member_select on org_settings;
create policy org_settings_member_select on org_settings
  for select using (org_id in (select current_user_org_ids()));
grant select on org_settings to authenticated;

create table if not exists org_section_permissions (
  org_id   uuid not null references organizations(id) on delete cascade,
  section  text not null,
  role     text not null,
  allowed  boolean not null default false,
  primary key (org_id, section, role)
);
alter table org_section_permissions enable row level security;
drop policy if exists org_section_perms_select on org_section_permissions;
create policy org_section_perms_select on org_section_permissions
  for select using (org_id in (select current_user_org_ids()));
grant select on org_section_permissions to authenticated;

create table if not exists org_github_installations (
  org_id          uuid primary key references organizations(id) on delete cascade,
  installation_id bigint not null,
  account_login   text,
  created_at      timestamptz not null default now()
);
alter table org_github_installations enable row level security;
drop policy if exists org_gh_install_select on org_github_installations;
create policy org_gh_install_select on org_github_installations
  for select using (org_id in (select current_user_org_ids()));
grant select on org_github_installations to authenticated;


-- ====================  PHASE 4 — Onboarding  ================================

alter table organizations add column if not exists template text;

create table if not exists org_setup_state (
  org_id     uuid primary key references organizations(id) on delete cascade,
  checklist  jsonb not null default '{}'::jsonb,
  dismissed  boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table org_setup_state enable row level security;
alter table org_setup_state force  row level security;
drop policy if exists org_setup_select on org_setup_state;
create policy org_setup_select on org_setup_state
  for select using (org_id in (select current_user_org_ids()));
drop policy if exists org_setup_update on org_setup_state;
create policy org_setup_update on org_setup_state
  for update using      (org_id in (select current_user_org_ids()))
             with check (org_id in (select current_user_org_ids()));
grant select, update on org_setup_state to authenticated;


-- ====================  PHASE 5 — Platform billing  ==========================

create table if not exists org_subscriptions (
  org_id                 uuid primary key references organizations(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text not null default 'free',
  status                 text not null default 'inactive',
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


-- ====================  Per-domain NOT NULL locks (deferred)  =================
-- Uncomment each once that domain's write routes stamp org_id:
--   alter table leads           alter column org_id set not null;
--   alter table documents       alter column org_id set not null;
--   alter table transactions    alter column org_id set not null;
--   alter table support_tickets alter column org_id set not null;
--   alter table messages        alter column org_id set not null;
--   alter table meetings        alter column org_id set not null;
--   alter table workspaces      alter column org_id set not null;
