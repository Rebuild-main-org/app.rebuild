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

-- Many agents per workspace (join table).
create table if not exists workspace_agents (
  workspace_id text not null references workspaces(id) on delete cascade,
  agent_id     text not null references agents(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (workspace_id, agent_id)
);
create index if not exists idx_workspace_agents_ws on workspace_agents(workspace_id);

alter table agents enable row level security;
alter table agent_files enable row level security;
alter table workspace_agents enable row level security;
-- Accessed via the service-role server client only.
