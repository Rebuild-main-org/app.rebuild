-- Project groups: organize a workspace's projects into named groups.
-- Run in the Supabase SQL editor.
create table if not exists project_groups (
  id           text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name         text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_project_groups_ws on project_groups(workspace_id);

-- Each project optionally belongs to one group (ungrouped when null).
alter table projects add column if not exists group_id text;

alter table project_groups enable row level security;
-- Accessed via the service-role server client only.
