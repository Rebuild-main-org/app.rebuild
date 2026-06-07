-- Super-admin role + per-user support tickets with discussion.
-- Run AFTER schema.sql, auth.sql, roles.sql and qa-support.sql.
--
-- IMPORTANT: Postgres forbids using a freshly-added enum value in the SAME
-- transaction. Run STEP 1 on its own first (click Run), THEN run STEP 2.

-- ─────────────────────────── STEP 1 (run alone) ───────────────────────────
-- Add the new top role. Idempotent. Must be committed before it can be used.
alter type role add value if not exists 'SUPER_ADMIN';


-- ─────────────────────────── STEP 2 (run after) ───────────────────────────
-- 1) Tie a support ticket to the user who opened it (so users see only theirs)
--    and track who resolved it.
alter table support_tickets add column if not exists requester_id text references users(id) on delete set null;
alter table support_tickets add column if not exists resolved_by_id text references users(id) on delete set null;
alter table support_tickets add column if not exists resolved_at timestamptz;
create index if not exists idx_support_requester on support_tickets(requester_id);

-- 2) Discussion thread on each support ticket.
create table if not exists support_comments (
  id          text primary key,
  ticket_id   text not null references support_tickets(id) on delete cascade,
  author_id   text not null references users(id),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_support_comments_ticket on support_comments(ticket_id);
alter table support_comments enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.

-- 3) Promote the built-in super admin (also enforced at runtime by the session
--    bootstrap, so this just persists it in the directory).
update profiles set role = 'SUPER_ADMIN' where lower(email) = 'admin@rebuild.tn';
update users    set role = 'SUPER_ADMIN' where lower(email) = 'admin@rebuild.tn';
