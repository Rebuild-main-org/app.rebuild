-- ============================================================================
-- Phase 2 — RBAC: separate PLATFORM admin from ORG roles; per-member capabilities
-- ============================================================================
-- Run after org-foundation.sql.

-- Platform operators (you), SEPARATE from org roles. Replaces the old env-based
-- elevation (BOOTSTRAP_* / hardcoded admin@rebuild.tn), now removed from
-- lib/auth/session.ts. Seed yourself once:
--   insert into platform_admins(user_id) values ('<your-auth-uid>');
create table if not exists platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security; -- no policy => service-role only

-- "Developer mode": unlocks the developer surface (IDE/Git/CI/CLI) for a whole
-- org at once (§3.2). Members still need it per-org or per-member to see code.
alter table organizations add column if not exists developer_mode boolean not null default false;

-- Per-member capability overrides — grant/revoke ONE capability to ONE user,
-- e.g. give a single PM code.access without flipping the whole org.
create table if not exists member_capabilities (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null,
  capability text not null,            -- matches lib/org-rbac.ts Capability
  granted    boolean not null default true,
  primary key (org_id, user_id, capability)
);
alter table member_capabilities enable row level security;
drop policy if exists member_caps_select on member_capabilities;
create policy member_caps_select on member_capabilities
  for select using (org_id in (select current_user_org_ids()));
grant select on member_capabilities to authenticated;
