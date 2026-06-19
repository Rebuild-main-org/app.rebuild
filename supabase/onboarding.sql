-- ============================================================================
-- Phase 4 — Onboarding: org templates + setup checklist
-- ============================================================================
-- Run after org-foundation.sql.

-- Template chosen in the create-org wizard (dev-solo | agency | studio | mixed).
alter table organizations add column if not exists template text;

-- Per-org setup checklist ("Setup 3/6") — persisted so progress survives reloads.
create table if not exists org_setup_state (
  org_id     uuid primary key references organizations(id) on delete cascade,
  checklist  jsonb not null default '{}'::jsonb,  -- { connect_ai:true, invite_member:false, ... }
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
