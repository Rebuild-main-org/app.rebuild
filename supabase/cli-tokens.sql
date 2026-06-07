-- Long-lived, non-expiring CLI tokens for rebuild216 (API-key style).
--
-- Supabase access tokens are short-lived (~1h) and their refresh tokens rotate,
-- which breaks very long agent runs (e.g. a 117-ticket delivery): the parent CLI
-- and the child MCP server share one rotating refresh token, so a refresh by one
-- invalidates the other and the session dies mid-run. A CLI token never expires
-- and is resolved directly to a user, so long runs no longer get logged out.
--
-- Only the SHA-256 hash of the token is stored; the secret is shown once at
-- mint time. Accessed via the service-role server client only. Run AFTER
-- schema.sql (needs the users table).
create table if not exists cli_tokens (
  id           text primary key,            -- non-secret prefix, shown in UI/logs
  token_hash   text not null unique,        -- sha256(secret), hex
  user_id      text not null references users(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists cli_tokens_user_idx on cli_tokens(user_id);
alter table cli_tokens enable row level security;
