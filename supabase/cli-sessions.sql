-- Tracks the last time a rebuild216 CLI made an authenticated call, per user,
-- so the app can show "CLI connected now". Run AFTER schema.sql.
create table if not exists cli_sessions (
  user_id      text primary key references users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_project text
);
alter table cli_sessions enable row level security;
-- Accessed via the service-role server client only.
