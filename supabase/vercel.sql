-- Vercel project link per workspace (for the deployment pipeline view).
-- Run AFTER schema.sql.
create table if not exists vercel_links (
  workspace_id text primary key references workspaces(id) on delete cascade,
  project_id   text not null,
  updated_at   timestamptz not null default now()
);
alter table vercel_links enable row level security;
-- Accessed via the service-role server client only.
