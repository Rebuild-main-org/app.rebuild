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
