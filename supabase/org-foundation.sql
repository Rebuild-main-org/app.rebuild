-- ============================================================================
-- Phase 0 — Multi-tenant foundation
--   Organization (the tenant) + OrganizationMember + org_id on every root entity
-- ============================================================================
-- Idempotent: safe to re-run. This migration ONLY adds the tenant entity, adds
-- a NULLABLE org_id to each root table, and backfills all existing data into a
-- single "legacy" organization so nothing is orphaned.
--
-- It deliberately does NOT set org_id NOT NULL or enable RLS on the domain
-- tables — that happens per-domain in the vertical slices (rls-finance.sql is
-- the first). This avoids a window where the column exists platform-wide but
-- nothing enforces it ("the worst of both worlds").

-- 1. Organizations -----------------------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  plan        text not null default 'free',   -- free | pro (Phase 5 billing)
  created_at  timestamptz not null default now()
);

-- 2. Organization membership (user <-> org, with the collapsed org-level role) -
--    4 roles (Phase 2 RBAC): owner | admin | member | guest.
create table if not exists organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null,                  -- = auth.users.id / profiles.id
  role        text not null default 'member'
              check (role in ('owner','admin','member','guest')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_org_members_user on organization_members(user_id);
create index if not exists idx_org_members_org  on organization_members(org_id);

-- 3. Shared helper used by every tenant RLS policy ---------------------------
--    SECURITY DEFINER so a policy can read organization_members without
--    recursing into that table's own RLS. STABLE: same result within a query.
create or replace function current_user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

-- 4. Add org_id to every root entity (NULLABLE for now) ----------------------
--    Guarded with to_regclass so it is safe even if a table is absent in this
--    environment (the schema is spread across several .sql files).
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
      execute format(
        'alter table %I add column if not exists org_id uuid references organizations(id)', t);
      execute format(
        'create index if not exists %I on %I(org_id)', 'idx_'||t||'_org', t);
    end if;
  end loop;
end $$;

-- 5. Backfill: one "legacy" org; all existing users + rows attached to it -----
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
    insert into organizations (name, slug) values ('Legacy', 'legacy')
    returning id into legacy_org;
  end if;

  -- Every existing profile becomes a member; map the old global role to an
  -- org role (the full RBAC collapse happens in Phase 2).
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

  -- Stamp every existing row with the legacy org.
  foreach t in array root_tables loop
    if to_regclass(t) is not null then
      execute format('update %I set org_id = %L where org_id is null', t, legacy_org);
    end if;
  end loop;
end $$;

-- 6. RLS for the tenant tables themselves ------------------------------------
--    (Writes to these still go through the service-role admin path for now —
--     invitations land in Phase 2 — so only SELECT policies are needed here.)
alter table organizations        enable row level security;
alter table organization_members enable row level security;

drop policy if exists org_members_self_select on organization_members;
create policy org_members_self_select on organization_members
  for select using (user_id = auth.uid());

drop policy if exists organizations_member_select on organizations;
create policy organizations_member_select on organizations
  for select using (id in (select current_user_org_ids()));

-- Scoped (authenticated) clients need table privileges *in addition to* RLS.
-- Supabase grants these by default for tables it creates via the dashboard;
-- granted explicitly here because these were created via raw SQL.
grant select on organizations        to authenticated;
grant select on organization_members to authenticated;
