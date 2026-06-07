-- Discord phase 2b: group rooms (N-person DMs) + per-user read markers.
-- Run AFTER discord.sql / discord2.sql / discord3.sql.

-- 1) Group threads. 1:1 threads keep user_a/user_b (now nullable so groups can
--    leave them empty). is_group + name describe a room.
alter table dm_threads add column if not exists is_group  boolean not null default false;
alter table dm_threads add column if not exists name      text;
alter table dm_threads add column if not exists created_by text references users(id) on delete set null;
alter table dm_threads alter column user_a drop not null;
alter table dm_threads alter column user_b drop not null;

-- 2) Participants for every thread (1:1 and group). Unifies membership checks.
create table if not exists dm_participants (
  thread_id  text not null references dm_threads(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists idx_dm_participants_user on dm_participants(user_id);

-- Backfill participants from existing 1:1 threads.
insert into dm_participants (thread_id, user_id)
  select id, user_a from dm_threads where user_a is not null
  on conflict do nothing;
insert into dm_participants (thread_id, user_id)
  select id, user_b from dm_threads where user_b is not null
  on conflict do nothing;

-- 3) Per-user read marker (unread = messages after last_read_at not sent by me).
create table if not exists dm_reads (
  thread_id     text not null references dm_threads(id) on delete cascade,
  user_id       text not null references users(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);
-- Seed existing participants as "caught up" so old threads aren't all unread.
insert into dm_reads (thread_id, user_id, last_read_at)
  select thread_id, user_id, now() from dm_participants
  on conflict do nothing;

alter table dm_participants enable row level security;
alter table dm_reads enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.
