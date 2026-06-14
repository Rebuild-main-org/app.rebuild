-- ============================================================
-- REBUILD Engineering OS — consolidated migration (all.sql)
-- Idempotent: safe to re-run. Paste once in the Supabase SQL editor.
-- ============================================================

-- ===================== schema.sql =====================
-- REBUILD Engineering OS — Supabase / PostgreSQL schema (spec §14)
-- Apply in the Supabase SQL editor or: psql "$DATABASE_URL" -f supabase/schema.sql
-- Then load supabase/seed.sql for sample data.

-- ───────────────────────────── Extensions ─────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────── Enums ────────────────────────────────
do $$ begin
  create type role as enum ('ADMIN','LEAD','ENGINEER','CLIENT');
  create type workspace_status as enum ('ACTIVE','PAUSED','ARCHIVED');
  create type project_status as enum ('PLANNING','ACTIVE','REVIEW','ON_HOLD','DONE','CANCELLED');
  create type ticket_type as enum ('TASK','BUG','FEATURE','REVIEW','EPIC','SPIKE');
  create type ticket_priority as enum ('CRITICAL','HIGH','MEDIUM','LOW');
  create type ticket_status as enum ('BACKLOG','TODO','IN_PROGRESS','IN_REVIEW','DONE');
  create type sprint_status as enum ('PLANNED','ACTIVE','COMPLETED');
  create type pr_status as enum ('OPEN','MERGED','CLOSED');
  create type ci_status as enum ('PASSING','FAILING','RUNNING','NONE');
  create type deploy_env as enum ('STAGING','PRODUCTION');
  create type deploy_status as enum ('SUCCESS','FAILED','IN_PROGRESS');
  create type file_status as enum ('unmodified','modified','added','untracked');
  create type doc_status as enum ('DRAFT','SENT','ACCEPTED','PAID','REJECTED');
  create type finance_kind as enum ('QUOTE','INVOICE');
  create type txn_kind as enum ('REVENUE','EXPENSE');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────── Tables ───────────────────────────────

create table if not exists users (
  id          text primary key,
  email       text unique not null,
  name        text not null,
  role        role not null default 'ENGINEER',
  github_id   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists workspaces (
  id            text primary key,
  name          text not null,
  slug          text unique not null,
  github_repo   text not null,
  status        workspace_status not null default 'ACTIVE',
  client_name   text not null,
  client_email  text not null,
  start_date    timestamptz not null default now(),
  technologies  text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists workspace_members (
  id            text primary key,
  user_id       text not null references users(id) on delete cascade,
  workspace_id  text not null references workspaces(id) on delete cascade,
  role          role not null default 'ENGINEER',
  joined_at     timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists projects (
  id            text primary key,
  name          text not null,
  short_code    text not null,
  status        project_status not null default 'PLANNING',
  workspace_id  text not null references workspaces(id) on delete cascade,
  description   text not null default '',
  start_date    timestamptz not null default now(),
  end_date      timestamptz
);

create table if not exists sprints (
  id          text primary key,
  name        text not null,
  goal        text not null default '',
  start_date  timestamptz not null,
  end_date    timestamptz not null,
  project_id  text not null references projects(id) on delete cascade,
  status      sprint_status not null default 'PLANNED'
);

create table if not exists milestones (
  id                  text primary key,
  title               text not null,
  description         text not null default '',
  due_date            timestamptz not null,
  project_id          text not null references projects(id) on delete cascade,
  done                boolean not null default false,
  validated_by_client boolean not null default false,
  client_feedback     text,
  validated_at        timestamptz
);

create table if not exists tickets (
  id            text primary key,
  short_id      text not null,
  title         text not null,
  description   text not null default '',
  type          ticket_type not null default 'TASK',
  priority      ticket_priority not null default 'MEDIUM',
  status        ticket_status not null default 'BACKLOG',
  project_id    text not null references projects(id) on delete cascade,
  assignee_id   text references users(id) on delete set null,
  reporter_id   text not null references users(id),
  labels        text[] not null default '{}',
  epic_id       text references tickets(id) on delete set null,
  milestone_id  text references milestones(id) on delete set null,
  sprint_id     text references sprints(id) on delete set null,
  points        int,
  due_date      timestamptz,
  commit_ref    text,
  branch        text,
  "order"       int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists comments (
  id          text primary key,
  content     text not null,
  ticket_id   text not null references tickets(id) on delete cascade,
  author_id   text not null references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists activities (
  id          text primary key,
  ticket_id   text not null references tickets(id) on delete cascade,
  kind        text not null,
  actor_id    text not null references users(id),
  message     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists git_commits (
  id            text primary key,
  hash          text not null,
  message       text not null,
  author_id     text not null references users(id),
  date          timestamptz not null default now(),
  workspace_id  text not null references workspaces(id) on delete cascade,
  ticket_id     text references tickets(id) on delete set null,
  branch        text not null default 'main'
);

create table if not exists pull_requests (
  id            text primary key,
  number        int not null,
  title         text not null,
  status        pr_status not null default 'OPEN',
  ci            ci_status not null default 'NONE',
  branch_from   text not null,
  branch_to     text not null default 'main',
  workspace_id  text not null references workspaces(id) on delete cascade,
  ticket_id     text references tickets(id) on delete set null,
  author_id     text not null references users(id),
  created_at    timestamptz not null default now()
);

create table if not exists deployments (
  id            text primary key,
  env           deploy_env not null,
  commit_hash   text not null,
  status        deploy_status not null default 'IN_PROGRESS',
  deployed_at   timestamptz not null default now(),
  workspace_id  text not null references workspaces(id) on delete cascade,
  branch        text not null default 'main',
  author_id     text not null references users(id)
);

create table if not exists branches (
  id                text primary key,
  workspace_id      text not null references workspaces(id) on delete cascade,
  name              text not null,
  ahead             int not null default 0,
  behind            int not null default 0,
  protected         boolean not null default false,
  last_commit_hash  text not null default '',
  last_commit_date  timestamptz not null default now(),
  last_author_id    text references users(id),
  unique (workspace_id, name)
);

create table if not exists repo_files (
  id                text primary key,
  workspace_id      text not null references workspaces(id) on delete cascade,
  path              text not null,
  content           text not null default '',
  original_content  text not null default '',
  status            file_status not null default 'unmodified',
  unique (workspace_id, path)
);

create table if not exists notifications (
  id          text primary key,
  type        text not null,
  content     text not null,
  user_id     text not null references users(id) on delete cascade,
  read        boolean not null default false,
  link_url    text,
  created_at  timestamptz not null default now()
);

create table if not exists messages (
  id              text primary key,
  content         text not null,
  author_id       text not null references users(id),
  workspace_id    text not null references workspaces(id) on delete cascade,
  is_from_client  boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists audit_logs (
  id           text primary key,
  action       text not null,
  entity_type  text not null,
  entity_id    text not null,
  user_id      text references users(id),
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id       text primary key references users(id) on delete cascade,
  theme         text not null default 'system',
  density       text not null default 'comfortable',
  language      text not null default 'en',
  accent        text not null default '#0a0a0a',
  email_digest  boolean not null default true,
  title         text,
  bio           text
);

create table if not exists finance_docs (
  id            text primary key,
  kind          finance_kind not null,
  number        text not null unique,
  workspace_id  text references workspaces(id) on delete set null,
  client_name   text not null,
  issue_date    timestamptz not null default now(),
  due_date      timestamptz not null,
  status        doc_status not null default 'DRAFT',
  items         jsonb not null default '[]',   -- [{description, quantity, unitPrice}]
  tax_rate      numeric not null default 19,
  currency      text not null default 'TND',
  notes         text
);

create table if not exists transactions (
  id            text primary key,
  kind          txn_kind not null,
  label         text not null,
  category      text not null default 'General',
  amount        numeric not null,
  date          timestamptz not null default now(),
  workspace_id  text references workspaces(id) on delete set null
);

create table if not exists documents (
  id              text primary key,
  name            text not null,
  mime_type       text not null,
  size            bigint not null,
  data_url        text not null,                 -- swap for a Supabase Storage path in prod
  workspace_id    text not null references workspaces(id) on delete cascade,
  project_id      text references projects(id) on delete cascade,
  uploaded_by_id  text not null references users(id),
  created_at      timestamptz not null default now()
);

create table if not exists meetings (
  id            text primary key,
  title         text not null,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  workspace_id  text references workspaces(id) on delete cascade,
  meet_link     text not null,
  attendee_ids  text[] not null default '{}',
  created_by_id text not null references users(id)
);

-- ───────────────────────────── Indexes ────────────────────────────────
create index if not exists idx_projects_workspace on projects(workspace_id);
create index if not exists idx_tickets_project on tickets(project_id);
create index if not exists idx_tickets_assignee on tickets(assignee_id);
create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_comments_ticket on comments(ticket_id);
create index if not exists idx_activities_ticket on activities(ticket_id);
create index if not exists idx_members_workspace on workspace_members(workspace_id);
create index if not exists idx_members_user on workspace_members(user_id);
create index if not exists idx_commits_workspace on git_commits(workspace_id);
create index if not exists idx_prs_workspace on pull_requests(workspace_id);
create index if not exists idx_repo_files_workspace on repo_files(workspace_id);
create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_documents_scope on documents(workspace_id, project_id);

-- ───────────────────── updated_at maintenance trigger ──────────────────
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_tickets_updated on tickets;
create trigger trg_tickets_updated before update on tickets
  for each row execute function set_updated_at();
drop trigger if exists trg_comments_updated on comments;
create trigger trg_comments_updated before update on comments
  for each row execute function set_updated_at();

-- ─────────────────────── Row-Level Security (spec §18) ─────────────────
-- The Next.js server uses the SERVICE ROLE key, which bypasses RLS. These
-- policies protect any direct client (anon key) access: the request must set
-- the acting user id, e.g.  select set_config('app.user_id', '<id>', true);
-- A user only sees workspaces they belong to (and everything scoped to them).

create or replace function app_uid() returns text as $$
  select nullif(current_setting('app.user_id', true), '')
$$ language sql stable;

create or replace function is_member(ws text) returns boolean as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = app_uid()
  )
$$ language sql stable;

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from users u where u.id = app_uid() and u.role = 'ADMIN')
$$ language sql stable;

do $$
declare t text;
begin
  foreach t in array array[
    'users','workspaces','workspace_members','projects','sprints','milestones',
    'tickets','comments','activities','git_commits','pull_requests','deployments',
    'branches','repo_files','notifications','messages','audit_logs',
    'user_preferences','finance_docs','transactions','documents','meetings'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- Membership-scoped read policies for the core workspace-bound tables.
-- Idempotent: drop-if-exists before create so the file can be re-run safely.
drop policy if exists ws_read on workspaces;
create policy ws_read on workspaces for select using (is_member(id) or is_admin());
drop policy if exists proj_read on projects;
create policy proj_read on projects for select using (is_member(workspace_id) or is_admin());
drop policy if exists ticket_read on tickets;
create policy ticket_read on tickets for select using (
  is_admin() or is_member((select workspace_id from projects p where p.id = project_id))
);
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select using (user_id = app_uid());
drop policy if exists prefs_rw on user_preferences;
create policy prefs_rw on user_preferences for all using (user_id = app_uid()) with check (user_id = app_uid());
drop policy if exists finance_admin on finance_docs;
create policy finance_admin on finance_docs for all using (is_admin()) with check (is_admin());
drop policy if exists txn_admin on transactions;
create policy txn_admin on transactions for all using (is_admin()) with check (is_admin());
drop policy if exists docs_read on documents;
create policy docs_read on documents for select using (is_member(workspace_id) or is_admin());

-- Note: add INSERT/UPDATE/DELETE policies per table as you expose direct client
-- writes. Until then, all writes go through the server (service role).

-- ===================== auth.sql =====================
-- REBUILD Engineering OS — authentication layer (run AFTER schema.sql).
-- Links Supabase Auth (auth.users) to an app `profiles` table carrying the
-- RBAC role. A trigger provisions a profile on every sign-up.
--   psql "$DATABASE_URL" -f supabase/auth.sql

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text not null default '',
  role        role not null default 'ENGINEER',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- A signed-in user can read and update only their own profile.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile when a new auth user signs up.
-- The project owner email is bootstrapped as ADMIN; everyone else ENGINEER.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when new.email = 'azizghed10@gmail.com' then 'ADMIN'::role else 'ENGINEER'::role end
  )
  on conflict (id) do nothing;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper used by RLS policies on app tables: the role of the current auth user.
create or replace function auth_role() returns role as $$
  select role from public.profiles where id = auth.uid()
$$ language sql stable security definer set search_path = public;

-- ===================== roles.sql =====================
-- Add the new staff roles to the `role` enum (spec personas).
-- Run in the Supabase SQL editor. ALTER TYPE ... ADD VALUE is idempotent with
-- IF NOT EXISTS and cannot run inside a transaction block (the editor is fine).

alter type role add value if not exists 'PM';
alter type role add value if not exists 'QA';
alter type role add value if not exists 'DESIGNER';
alter type role add value if not exists 'SALES';
alter type role add value if not exists 'FINANCE';
alter type role add value if not exists 'SUPPORT';

-- ===================== crm.sql =====================
-- CRM / pre-sales pipeline. Run AFTER schema.sql.
--   psql "$DATABASE_URL" -f supabase/crm.sql   (or paste in the SQL editor)

do $$ begin
  create type lead_stage as enum ('LEAD','QUALIFIED','PROPOSAL','WON','LOST');
exception when duplicate_object then null; end $$;

create table if not exists leads (
  id            text primary key,
  company       text not null,
  contact_name  text not null default '',
  contact_email text not null default '',
  stage         lead_stage not null default 'LEAD',
  value         numeric not null default 0,
  currency      text not null default 'TND',
  source        text not null default '',
  owner_id      text references users(id) on delete set null,
  notes         text,
  workspace_id  text references workspaces(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_owner on leads(owner_id);

drop trigger if exists trg_leads_updated on leads;
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

alter table leads enable row level security;
-- Server uses the service role (bypasses RLS); authorization is enforced in the
-- API routes (crm.view / crm.manage). Direct anon access stays closed by default.

-- Optional sample pipeline:
insert into leads (id, company, contact_name, contact_email, stage, value, currency, source) values
  ('lead_1','Globex','Marie Dupont','marie@globex.com','QUALIFIED',24000,'TND','Referral'),
  ('lead_2','Initech','Peter Gibbons','peter@initech.com','PROPOSAL',38000,'TND','Inbound'),
  ('lead_3','Umbrella','Ada Wong','ada@umbrella.com','LEAD',12000,'TND','Event')
on conflict (id) do nothing;

-- ===================== p0-tickets.sql =====================
-- P0 epics 1 & 2: ticket hierarchy, links, watchers, attachments.
-- Run AFTER schema.sql, in the Supabase SQL editor.
-- (ALTER TYPE ... ADD VALUE cannot run in a transaction block — the editor is fine.)

-- 1) Sub-task type + parent link on tickets.
alter type ticket_type add value if not exists 'SUBTASK';
alter table tickets add column if not exists parent_id text references tickets(id) on delete set null;
create index if not exists idx_tickets_parent on tickets(parent_id);

-- 2) Ticket links (blocks / relates / duplicates) — directional.
do $$ begin
  create type link_type as enum ('BLOCKS','RELATES','DUPLICATES');
exception when duplicate_object then null; end $$;

create table if not exists ticket_links (
  id              text primary key,
  from_ticket_id  text not null references tickets(id) on delete cascade,
  to_ticket_id    text not null references tickets(id) on delete cascade,
  type            link_type not null default 'RELATES',
  created_at      timestamptz not null default now(),
  unique (from_ticket_id, to_ticket_id, type)
);
create index if not exists idx_links_from on ticket_links(from_ticket_id);
create index if not exists idx_links_to on ticket_links(to_ticket_id);

-- 3) Watchers.
create table if not exists ticket_watchers (
  ticket_id  text not null references tickets(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- 4) Ticket attachments (base64 data URL for now; swap to Storage later).
create table if not exists ticket_attachments (
  id              text primary key,
  ticket_id       text not null references tickets(id) on delete cascade,
  name            text not null,
  mime_type       text not null,
  size            bigint not null,
  data_url        text not null,
  uploaded_by_id  text references users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_attach_ticket on ticket_attachments(ticket_id);

alter table ticket_links enable row level security;
alter table ticket_watchers enable row level security;
alter table ticket_attachments enable row level security;

-- ===================== p0-reviews.sql =====================
-- P0 epic 4: PR reviews + comments. Run AFTER schema.sql.

do $$ begin
  create type review_state as enum ('APPROVED','CHANGES_REQUESTED','COMMENTED');
exception when duplicate_object then null; end $$;

create table if not exists pr_reviews (
  id           text primary key,
  pr_id        text not null references pull_requests(id) on delete cascade,
  reviewer_id  text not null references users(id),
  state        review_state not null,
  body         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pr_reviews_pr on pr_reviews(pr_id);

create table if not exists pr_comments (
  id          text primary key,
  pr_id       text not null references pull_requests(id) on delete cascade,
  author_id   text not null references users(id),
  path        text,          -- file path for line comments (null = general)
  line        int,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pr_comments_pr on pr_comments(pr_id);

alter table pr_reviews enable row level security;
alter table pr_comments enable row level security;

-- Optional: require an approving review before merge (enforced in the app).
alter table pull_requests add column if not exists requires_approval boolean not null default true;

-- ===================== storage.sql =====================
-- MUST-HAVE #3: object storage. Run AFTER schema.sql + p0-tickets.sql.
--
-- 1) In Supabase → Storage, create a PRIVATE bucket named "uploads".
-- 2) Set STORAGE_BUCKET=uploads in your env.
-- 3) Run this file to add the storage_path columns (data_url kept nullable for
--    backward compatibility with already-stored inline files).

alter table documents add column if not exists storage_path text;
alter table documents alter column data_url drop not null;

alter table ticket_attachments add column if not exists storage_path text;
-- ticket_attachments.data_url was already nullable; ensure it stays so:
alter table ticket_attachments alter column data_url drop not null;

-- ===================== time-tracking.sql =====================
-- SHOULD: time tracking. Run AFTER schema.sql + p0-tickets.sql.
-- Logs time per ticket so work can be billed at the time spent.

create table if not exists time_entries (
  id         text primary key,
  ticket_id  text not null references tickets(id) on delete cascade,
  user_id    text not null references users(id),
  minutes    int  not null check (minutes > 0),
  note       text,
  spent_on   date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_time_entries_ticket on time_entries(ticket_id);
create index if not exists idx_time_entries_user on time_entries(user_id);

alter table time_entries enable row level security;

-- Optional: original estimate on a ticket (hours), for estimate-vs-actual.
alter table tickets add column if not exists estimate_hours numeric;

-- ===================== qa-support.sql =====================
-- SHOULD: QA (test management) + Support (helpdesk + SLA).
-- Run AFTER schema.sql + p0-tickets.sql.

-- QA ---------------------------------------------------------------------------
do $$ begin
  create type test_run_status as enum ('PASS','FAIL','BLOCKED','SKIPPED','UNTESTED');
exception when duplicate_object then null; end $$;

create table if not exists test_cases (
  id            text primary key,
  project_id    text not null references projects(id) on delete cascade,
  title         text not null,
  steps         text not null default '',
  expected      text not null default '',
  created_by_id text not null references users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_test_cases_project on test_cases(project_id);

create table if not exists test_runs (
  id           text primary key,
  test_case_id text not null references test_cases(id) on delete cascade,
  status       test_run_status not null,
  notes        text,
  run_by_id    text not null references users(id),
  ticket_id    text references tickets(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_test_runs_case on test_runs(test_case_id);

alter table test_cases enable row level security;
alter table test_runs enable row level security;

-- Support ----------------------------------------------------------------------
do $$ begin
  create type support_status as enum ('NEW','OPEN','PENDING','RESOLVED','CLOSED');
exception when duplicate_object then null; end $$;

create table if not exists support_tickets (
  id              text primary key,
  subject         text not null,
  body            text not null default '',
  requester_email text not null,
  status          support_status not null default 'NEW',
  priority        ticket_priority not null default 'MEDIUM',
  workspace_id    text references workspaces(id) on delete set null,
  assignee_id     text references users(id),
  sla_due_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_support_status on support_tickets(status);
create index if not exists idx_support_ws on support_tickets(workspace_id);

alter table support_tickets enable row level security;

-- Sprint burndown snapshots (captured daily by a cron/job).
create table if not exists sprint_snapshots (
  id               text primary key,
  sprint_id        text not null references sprints(id) on delete cascade,
  day              date not null,
  remaining_points int not null default 0,
  done_points      int not null default 0,
  captured_at      timestamptz not null default now(),
  unique (sprint_id, day)
);
create index if not exists idx_snapshots_sprint on sprint_snapshots(sprint_id);
alter table sprint_snapshots enable row level security;

-- ===================== custom-fields.sql =====================
-- COULD: custom fields on tickets, defined per project. Run AFTER schema.sql.

do $$ begin
  create type custom_field_type as enum ('TEXT','NUMBER','SELECT','DATE');
exception when duplicate_object then null; end $$;

create table if not exists custom_fields (
  id          text primary key,
  project_id  text not null references projects(id) on delete cascade,
  name        text not null,
  type        custom_field_type not null default 'TEXT',
  options     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_custom_fields_project on custom_fields(project_id);

create table if not exists ticket_field_values (
  field_id  text not null references custom_fields(id) on delete cascade,
  ticket_id text not null references tickets(id) on delete cascade,
  value     text not null default '',
  primary key (field_id, ticket_id)
);
create index if not exists idx_field_values_ticket on ticket_field_values(ticket_id);

alter table custom_fields enable row level security;
alter table ticket_field_values enable row level security;

-- ===================== fixes-abcf.sql =====================
-- Critical logical fixes A/B/C/F. Run AFTER schema.sql (+ p0-tickets.sql).

-- ── B: unify PR source (mirror GitHub PRs into Supabase) ──────────────────
-- GitHub authors have no internal user id, so author_id must allow null.
alter table pull_requests alter column author_id drop not null;
-- Upsert key for mirroring by (workspace, number).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pull_requests_ws_number_key') then
    alter table pull_requests add constraint pull_requests_ws_number_key unique (workspace_id, number);
  end if;
end $$;

-- ── F: atomic, unique ticket numbers ──────────────────────────────────────
-- Per-project counter incremented atomically; seed past the current max.
alter table projects add column if not exists ticket_seq int not null default 100;

do $$
declare p record; m int;
begin
  for p in select id from projects loop
    select coalesce(max(nullif(split_part(short_id, '-', 2), '')::int), 100) into m
      from tickets where project_id = p.id;
    update projects set ticket_seq = greatest(ticket_seq, m) where id = p.id;
  end loop;
end $$;

-- Atomic allocator: returns the next ticket number for a project.
create or replace function next_ticket_number(p_project_id text)
returns int as $$
  update projects set ticket_seq = ticket_seq + 1
  where id = p_project_id
  returning ticket_seq;
$$ language sql;

-- Safety net against duplicate keys.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_project_shortid_key') then
    alter table tickets add constraint tickets_project_shortid_key unique (project_id, short_id);
  end if;
end $$;

-- ===================== sprint1.sql =====================
-- Sprint 1 fixes. Run AFTER schema.sql + auth.sql.

-- Fix L: finance documents readable/writable by ADMIN and FINANCE (was ADMIN only).
drop policy if exists finance_admin on finance_docs;
drop policy if exists finance_rw on finance_docs;
create policy finance_rw on finance_docs for all
  using (
    is_admin()
    or exists (select 1 from users u where u.id = app_uid() and u.role = 'FINANCE')
  )
  with check (
    is_admin()
    or exists (select 1 from users u where u.id = app_uid() and u.role = 'FINANCE')
  );

-- ===================== agent-docs.sql =====================
  -- Agent guidance docs editable from the admin panel and injected into the
  -- rebuild216 CLI run (skills.md = capabilities/conventions; soul.md = identity/
  -- tone/principles). Run AFTER schema.sql.

  create table if not exists agent_docs (
    name        text primary key,            -- 'skills' | 'soul'
    content     text not null default '',
    updated_at  timestamptz not null default now()
  );

  alter table agent_docs enable row level security;
  -- Accessed only via the service-role server client; RLS-enabled with no policy
  -- denies anon/authenticated direct access by default.

  -- Seed sensible defaults (edit later from the admin panel). Dollar-quoting
  -- ($soul$ … $soul$) lets the markdown contain quotes without escaping.
  insert into agent_docs (name, content) values
  ('soul', $soul$# Soul — who you are

  You are the **REBUILD delivery agent**: a senior software engineer working
  autonomously inside the codebase of a REBUILD client project. You are not a
  chat assistant — you ship. Your output is committed, verifiable code that moves
  tickets to DONE.

  ## Identity
  - You belong to REBUILD, a software engineering agency. The work you produce is
    delivered to real clients under REBUILD's name. Quality is the brand.
  - You are trusted with a developer's seat: you read the repo, write code, run
    tests, and update the project board. You act with the judgement of someone who
    owns the outcome, not someone following a script.

  ## Principles
  1. **Production-ready or not at all.** Never ship mock data, stubs, seeds, TODO
    placeholders, or "this would normally…" fallbacks. If something can't be done
    for real, you say so in a comment and leave the ticket honest — you do not
    fake it.
  2. **Truth over optimism.** If tests fail, you say they fail. If you skipped a
    step, you say so. A ticket only reaches DONE when its work is real and
    verified. You never mark something done to look productive.
  3. **Small, focused, reversible.** One ticket = one coherent change = one commit.
    You keep diffs tight and reviewable. You never bundle unrelated work.
  4. **Match the house, don't rebuild it.** You write code that reads like the
    surrounding code — same naming, same patterns, same comment density. You are a
    guest in someone's codebase; you leave it more consistent, never more yours.
  5. **Safety is not optional.** You never run destructive commands, never delete
    the repository, never exfiltrate secrets, and never push. Pushing is a human
    decision made later via /push.
  6. **Earn the next ticket.** Verify before you advance. A green typecheck and
    passing tests are the price of moving on.

  ## Tone
  - Concise and direct. Explain *why* when a choice is non-obvious; otherwise let
    the code speak.
  - No filler, no hype, no apologies. State what you did, what you verified, and
    what's left.$soul$),
  ('skills', $skills$# Skills — how you work

  This is the playbook for delivering tickets on a REBUILD project. Read it, then
  read the actual repo before assuming anything — these are defaults; the project's
  own README, package.json scripts, and conventions always win.

  ## Orient first (before touching code)
  1. Read .rebuild/TICKETS.md and the docs in .rebuild/docs/ for context.
  2. Inspect the repo: package.json (scripts + deps), the framework, the folder
    layout, the test setup, the lint config. Detect the stack — do not assume it.
  3. Find 2–3 files near the ticket's area and mirror their style.

  ## Stack defaults (typical REBUILD web project)
  - **Next.js (App Router) + React + TypeScript**, Tailwind + shadcn/ui for UI.
  - **Supabase** for data/auth (@supabase/ssr; a service-role client server-side).
  - **Anthropic** for AI features — default model claude-opus-4-8, adaptive
    thinking. Never hardcode an API key; read it from the environment.
  - **Octokit** for any GitHub integration.
  - **Vitest** for tests.
  > If the repo differs, follow the repo. This list tells you what's *likely*, not
  > what's *true*.

  ## Commands (run them — don't guess the result)
  Discover the real scripts in package.json, then use them. Common ones:
  - npm run typecheck — must be clean before any commit.
  - npm run lint — fix what you introduce.
  - npm test — the verification gate; tests must pass before DONE.
  - npm run build — run for changes that could affect the build.
  Install deps with the project's lockfile manager (npm ci / pnpm i / yarn).

  ## Coding conventions
  - **Zero mock / seed / fallback.** Real data paths only. No fake responses, no
    "if (dev) return sampleData". If a dependency (DB, API key) is missing, fail
    loudly with a clear error — don't paper over it.
  - **TypeScript strict.** No "any" to silence the compiler; type it properly.
  - **Match surrounding style** — naming, imports ordering, comment density. Add a
    comment only where intent isn't obvious from the code.
  - **No new dependency** unless the ticket needs it and there's no in-repo
    equivalent. Prefer the libraries already present.
  - **Security:** never commit secrets; read config from env. Respect existing
    auth/RBAC checks — never weaken a guard to make a feature "work".

  ## Per-ticket workflow (via the rebuild MCP tools)
  1. list_tickets → pick the next non-DONE ticket.
  2. update_ticket_status(id, "IN_PROGRESS").
  3. Implement the change. Keep the diff focused on this ticket only.
  4. **Verify:** typecheck + tests (+ build if relevant). Fix until green. If you
    genuinely cannot make it green, leave the ticket in IN_PROGRESS, add a
    comment explaining the blocker, and move on — do not mark it DONE.
  5. git add -A && git commit -m "type: summary [SHORT-ID]" — Conventional
    Commit style, referencing the ticket short id. **Never git push.**
  6. update_ticket_status(id, "IN_REVIEW") → then "DONE" once verified.
  7. add_comment(id, "<what changed, what was verified>").

  ## Definition of Done
  - Code implements the ticket's intent, with no mocks/placeholders.
  - typecheck clean, test passing, lint clean for touched files.
  - Exactly one focused commit, message references the ticket short id.
  - A status of DONE and a comment summarising the change.
  - Nothing pushed — the human reviews and pushes via /push.$skills$),
('architecture', $arch$# Architecture — the system you must respect

Defaults for a typical REBUILD web project. The actual repo always wins — if what
you read in the codebase differs from this, follow the codebase. Use this to know
where things belong so your changes stay consistent.

## Shape (Next.js App Router)
- app/ — routes. Server Components by default; "use client" only when a component
  needs state, effects, or browser APIs. Route handlers live in app/api/**/route.ts.
- components/ — UI. components/ui/ is the shadcn/ui primitive layer (don't fork
  it); feature components compose those primitives.
- lib/ — the brains. Data access, auth, integrations, and pure helpers live here.
  Business rules belong in lib/, not in components or route handlers.

## Layering (respect the direction of dependencies)
Route / Server Component → lib/ (data, auth, mutations) → Supabase / GitHub / Anthropic.
UI components → lib/ helpers (pure). Never the reverse.
- Never call Supabase, GitHub, or Anthropic directly from a component or a route
  handler. Go through the lib/ function that owns that concern.
- Keep decision logic pure and extracted (auth gates, ticket numbering, merge
  gates) so it can be unit-tested without a DB. New non-trivial logic should be a
  pure function in lib/ with a Vitest test.

## Data and auth
- All data flows through Supabase via the server client in lib/. No mock, seed, or
  fallback data — if a query fails, surface the error.
- Authorization is centralized: use the existing guard/RBAC helpers
  (requireWorkspace/requireProject, can(), role checks). Never inline a new
  permission check that bypasses them, and never weaken a guard to ship a feature.

## Conventions
- One responsibility per module; match the file's existing structure and naming.
- Server-only secrets stay server-only (never imported into client bundles).
- Realtime/notifications go through the existing event bus — don't invent a
  parallel mechanism.
- Before adding a new layer, pattern, or dependency: check whether the codebase
  already has one. Extend the existing pattern rather than introducing a rival.

## When a ticket touches architecture
- Keep the change within the established boundaries above.
- If a ticket genuinely requires a new boundary or pattern, note the decision in
  the ticket comment (what and why) so a human can review the architectural choice
  before it spreads.$arch$)
on conflict (name) do nothing;

-- ===================== super-admin.sql =====================
-- Super-admin role + per-user support tickets with discussion.
-- Run in the Supabase SQL editor (ALTER TYPE ... ADD VALUE auto-commits there).
-- Run AFTER schema.sql, auth.sql, roles.sql and qa-support.sql.

-- 1) New top role. Idempotent; cannot run inside a transaction block.
alter type role add value if not exists 'SUPER_ADMIN';

-- 2) Tie a support ticket to the user who opened it (so users see only theirs)
--    and track who resolved it.
alter table support_tickets add column if not exists requester_id text references users(id) on delete set null;
alter table support_tickets add column if not exists resolved_by_id text references users(id) on delete set null;
alter table support_tickets add column if not exists resolved_at timestamptz;
create index if not exists idx_support_requester on support_tickets(requester_id);

-- 3) Discussion thread on each support ticket.
create table if not exists support_comments (
  id          text primary key,
  ticket_id   text not null references support_tickets(id) on delete cascade,
  author_id   text not null references users(id),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_support_comments_ticket on support_comments(ticket_id);
alter table support_comments enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- 4) Promote the built-in super admin: run these AFTER this script commits
--    (a freshly-added enum value can't be used in the same transaction).
--    admin@rebuild.tn is also elevated at runtime by the session bootstrap.
--      update profiles set role = 'SUPER_ADMIN' where lower(email) = 'admin@rebuild.tn';
--      update users    set role = 'SUPER_ADMIN' where lower(email) = 'admin@rebuild.tn';

-- ===================== discord.sql =====================
-- Discord: community directory + 1:1 direct messages.
-- Run AFTER schema.sql.

-- 1) Enhanced profile fields on user_preferences.
alter table user_preferences add column if not exists availability text not null default 'AVAILABLE';
alter table user_preferences add column if not exists skills text[] not null default '{}';
alter table user_preferences add column if not exists tags text[] not null default '{}';
alter table user_preferences add column if not exists open_to_talk boolean not null default false;

-- 2) Direct-message threads (one row per pair of users).
create table if not exists dm_threads (
  id              text primary key,
  user_a          text not null references users(id) on delete cascade,
  user_b          text not null references users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (user_a, user_b)
);
create index if not exists idx_dm_threads_a on dm_threads(user_a);
create index if not exists idx_dm_threads_b on dm_threads(user_b);

-- 3) Direct messages.
create table if not exists dm_messages (
  id          text primary key,
  thread_id   text not null references dm_threads(id) on delete cascade,
  sender_id   text not null references users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists idx_dm_messages_thread on dm_messages(thread_id, created_at);

alter table dm_threads enable row level security;
alter table dm_messages enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- ===================== permissions.sql =====================
-- Section permissions matrix (super-admin editable). Overrides the static
-- defaults per (section, role). Run AFTER schema.sql.

create table if not exists section_permissions (
  section    text not null,
  role       role not null,
  allowed    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (section, role)
);
alter table section_permissions enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- ===================== discord2.sql =====================
-- Discord phase 2: presence heartbeat, message reactions, private member notes.
-- Run AFTER discord.sql.

-- 1) Live presence via a heartbeat (robust on serverless; "online" = recent).
alter table users add column if not exists last_seen_at timestamptz;

-- 2) Emoji reactions on direct messages.
create table if not exists dm_reactions (
  id          text primary key,
  message_id  text not null references dm_messages(id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists idx_dm_reactions_msg on dm_reactions(message_id);

-- 3) Private notes a user keeps about another member (only the author sees them).
create table if not exists member_notes (
  author_id   text not null references users(id) on delete cascade,
  subject_id  text not null references users(id) on delete cascade,
  content     text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (author_id, subject_id)
);

alter table dm_reactions enable row level security;
alter table member_notes enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- ===================== discord3.sql =====================
-- Discord phase 2a: DM attachments, block/mute, DND + profile visibility.
-- Run AFTER discord.sql / discord2.sql.

-- 1) One optional attachment per direct message (base64 data URL, like documents).
alter table dm_messages add column if not exists attachment_url  text;
alter table dm_messages add column if not exists attachment_name text;
alter table dm_messages add column if not exists attachment_type text;

-- 2) Do-Not-Disturb + profile visibility.
alter table user_preferences add column if not exists dnd boolean not null default false;
-- visibility ∈ 'everyone' | 'team' | 'nobody'
alter table user_preferences add column if not exists visibility text not null default 'everyone';

-- 3) Block / mute relationships (kind = 'BLOCK' | 'MUTE').
create table if not exists user_blocks (
  blocker_id  text not null references users(id) on delete cascade,
  target_id   text not null references users(id) on delete cascade,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, target_id, kind)
);
create index if not exists idx_user_blocks_blocker on user_blocks(blocker_id);
alter table user_blocks enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- ===================== discord4.sql =====================
-- Discord phase 2b: group rooms (N-person DMs) + per-user read markers.
-- Run AFTER discord.sql / discord2.sql / discord3.sql.

-- 1) Group threads. 1:1 threads keep user_a/user_b (now nullable so groups can
--    leave them empty). is_group + name describe a room.
alter table dm_threads add column if not exists is_group  boolean not null default false;
alter table dm_threads add column if not exists name      text;
alter table dm_threads add column if not exists created_by text references users(id) on delete set null;
alter table dm_threads alter column user_a drop not null;
alter table dm_threads alter column user_b drop not null;

-- 2) Participants for every thread (1:1 and group). Unifies membership checks.
create table if not exists dm_participants (
  thread_id  text not null references dm_threads(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists idx_dm_participants_user on dm_participants(user_id);

-- Backfill participants from existing 1:1 threads.
insert into dm_participants (thread_id, user_id)
  select id, user_a from dm_threads where user_a is not null
  on conflict do nothing;
insert into dm_participants (thread_id, user_id)
  select id, user_b from dm_threads where user_b is not null
  on conflict do nothing;

-- 3) Per-user read marker (unread = messages after last_read_at not sent by me).
create table if not exists dm_reads (
  thread_id     text not null references dm_threads(id) on delete cascade,
  user_id       text not null references users(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);
-- Seed existing participants as "caught up" so old threads aren't all unread.
insert into dm_reads (thread_id, user_id, last_read_at)
  select thread_id, user_id, now() from dm_participants
  on conflict do nothing;

alter table dm_participants enable row level security;
alter table dm_reads enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- ===================== vercel.sql =====================
-- Vercel project link per workspace (for the deployment pipeline view).
-- Run AFTER schema.sql.
create table if not exists vercel_links (
  workspace_id text primary key references workspaces(id) on delete cascade,
  project_id   text not null,
  updated_at   timestamptz not null default now()
);
alter table vercel_links enable row level security;
-- Accessed via the service-role server client only.

-- ===================== agents.sql =====================
-- AI Agents library (Super Admin). An agent is a named bundle of markdown /
-- config files (soul.md, skills.md, UI templates, languages, rules, knowledge…).
-- Workspaces select an agent; rebuild216 injects its files. Run AFTER schema.sql.

create table if not exists agents (
  id          text primary key,
  name        text not null,
  description text not null default '',
  created_by  text references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists agent_files (
  id          text primary key,
  agent_id    text not null references agents(id) on delete cascade,
  name        text not null,                       -- e.g. soul.md, ui/dashboard.md
  kind        text not null default 'knowledge',   -- doc|ui|language|rule|knowledge|config
  content     text not null default '',
  updated_at  timestamptz not null default now(),
  unique (agent_id, name)
);
create index if not exists idx_agent_files_agent on agent_files(agent_id);

create table if not exists workspace_agents (
  workspace_id text primary key references workspaces(id) on delete cascade,
  agent_id     text references agents(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table agents enable row level security;
alter table agent_files enable row level security;
alter table workspace_agents enable row level security;
-- Accessed via the service-role server client only.

-- ===================== agents-multi.sql =====================
-- Allow MULTIPLE agents per workspace (replaces the single-select table).
-- Safe to run after agents.sql.
drop table if exists workspace_agents cascade;
create table if not exists workspace_agents (
  workspace_id text not null references workspaces(id) on delete cascade,
  agent_id     text not null references agents(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (workspace_id, agent_id)
);
create index if not exists idx_workspace_agents_ws on workspace_agents(workspace_id);
alter table workspace_agents enable row level security;

-- ===================== cli-sessions.sql =====================
-- Tracks the last time a rebuild216 CLI made an authenticated call, per user,
-- so the app can show "CLI connected now". Run AFTER schema.sql.
create table if not exists cli_sessions (
  user_id      text primary key references users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_project text
);
alter table cli_sessions enable row level security;
-- Accessed via the service-role server client only.

-- ── CRM hardening: one short code per workspace (see crm-fixes.sql for the
--    data de-duplication that must run before this index on existing DBs) ────
create unique index if not exists projects_ws_shortcode_key
  on projects (workspace_id, upper(short_code));

-- ── AI governance: usage + cost ledger (see ai-usage.sql) ───────────────────
create table if not exists ai_usage (
  id            text primary key,
  user_id       text references users(id) on delete set null,
  feature       text not null default 'chat',
  model         text not null,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  cost_usd      numeric not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ai_usage_user on ai_usage(user_id, created_at);
create index if not exists idx_ai_usage_created on ai_usage(created_at);
alter table ai_usage enable row level security;

-- AI usage scope columns (per-project / per-workspace attribution)
alter table ai_usage add column if not exists workspace_id text;
alter table ai_usage add column if not exists project_id text;
create index if not exists idx_ai_usage_ws on ai_usage(workspace_id, created_at);

-- ── Project groups (organize a workspace's projects) ────────────────────────
create table if not exists project_groups (
  id           text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name         text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_project_groups_ws on project_groups(workspace_id);
alter table projects add column if not exists group_id text;
alter table project_groups enable row level security;

-- ── Per-user Anthropic API key (« Connect with Claude ») ───────────────────
create table if not exists user_ai_keys (
  user_id       text primary key references users(id) on delete cascade,
  anthropic_key text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table user_ai_keys enable row level security;

-- ── Long-lived CLI tokens (rebuild216, non-expiring) ───────────────────────
create table if not exists cli_tokens (
  id           text primary key,
  token_hash   text not null unique,
  user_id      text not null references users(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists cli_tokens_user_idx on cli_tokens(user_id);
alter table cli_tokens enable row level security;

-- ── App-wide settings (key/value) — e.g. active AI model ───────────────────
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

-- ── Phase A blueprints (Conception → approved Blueprint → workspace) ────────
create table if not exists blueprints (
  id              text primary key,
  title           text not null,
  status          text not null default 'DRAFT',
  spec_yaml       text not null default '',
  answers         text not null default '',
  critique        jsonb,
  plan            jsonb,
  feasibility     text not null default '',
  design_doc      text not null default '',
  acceptance_yaml text not null default '',
  prereqs         jsonb not null default '{}'::jsonb,
  gates           jsonb not null default '{}'::jsonb,
  documents       jsonb not null default '[]'::jsonb,
  figma_url       text not null default '',
  workspace_id    text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists blueprints_status_idx on blueprints(status);
alter table blueprints enable row level security;

-- ===================== ai-feedback.sql =====================
-- Human feedback on AI outputs (Ticket 2). One row per thumbs up/down on a
-- traced AI action (trace_id from withAi/currentTraceId, lib/ai-usage.ts).
create table if not exists ai_feedback (
  id           text primary key,
  trace_id     text not null,
  user_id      text references users(id) on delete set null,
  workspace_id text,
  feature      text not null default 'chat',
  score        smallint not null default 0 check (score in (-1, 0, 1)),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ai_feedback_trace on ai_feedback(trace_id);
create index if not exists idx_ai_feedback_feature on ai_feedback(feature, created_at);
create index if not exists idx_ai_feedback_created on ai_feedback(created_at);
alter table ai_feedback enable row level security;
