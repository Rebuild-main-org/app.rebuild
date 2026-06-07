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
