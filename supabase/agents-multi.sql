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
