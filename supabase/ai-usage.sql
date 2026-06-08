-- AI governance: usage + cost ledger. Run in the Supabase SQL editor.
create table if not exists ai_usage (
  id            text primary key,
  user_id       text references users(id) on delete set null,
  workspace_id  text,
  project_id    text,
  feature       text not null default 'chat',
  model         text not null,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  cost_usd      numeric not null default 0,
  created_at    timestamptz not null default now()
);
-- Add the scope columns if the table already existed (idempotent).
alter table ai_usage add column if not exists workspace_id text;
alter table ai_usage add column if not exists project_id text;
-- Cache accounting: prompt-cache reads/writes, so caching savings are measurable
-- (see lib/ai-usage.ts recordAiUsage / costUsd).
alter table ai_usage add column if not exists cache_read_tokens     int not null default 0;
alter table ai_usage add column if not exists cache_creation_tokens int not null default 0;
create index if not exists idx_ai_usage_user on ai_usage(user_id, created_at);
create index if not exists idx_ai_usage_created on ai_usage(created_at);
create index if not exists idx_ai_usage_ws on ai_usage(workspace_id, created_at);
alter table ai_usage enable row level security;
-- Accessed via the service-role server client only.
