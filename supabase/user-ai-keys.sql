-- Per-user Anthropic API key (« Connect with Claude »). Server AI uses the
-- caller's own key when present, else the shared server key. Service-role only.
-- Run in the Supabase SQL editor.
create table if not exists user_ai_keys (
  user_id       text primary key references users(id) on delete cascade,
  anthropic_key text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table user_ai_keys enable row level security;
-- No policies: accessed only via the service-role server client. The key is
-- never returned to the browser (only a "connected" flag + a masked hint).
