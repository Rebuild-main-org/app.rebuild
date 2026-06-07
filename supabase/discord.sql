-- Discord: community directory + 1:1 direct messages.
-- Run AFTER schema.sql.

-- 1) Enhanced profile fields on user_preferences.
alter table user_preferences add column if not exists availability text not null default 'AVAILABLE';
alter table user_preferences add column if not exists skills text[] not null default '{}';
alter table user_preferences add column if not exists tags text[] not null default '{}';
alter table user_preferences add column if not exists open_to_talk boolean not null default false;

-- 2) Direct-message threads (one row per pair of users).
create table if not exists dm_threads (
  id              text primary key,
  user_a          text not null references users(id) on delete cascade,
  user_b          text not null references users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (user_a, user_b)
);
create index if not exists idx_dm_threads_a on dm_threads(user_a);
create index if not exists idx_dm_threads_b on dm_threads(user_b);

-- 3) Direct messages.
create table if not exists dm_messages (
  id          text primary key,
  thread_id   text not null references dm_threads(id) on delete cascade,
  sender_id   text not null references users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists idx_dm_messages_thread on dm_messages(thread_id, created_at);

alter table dm_threads enable row level security;
alter table dm_messages enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.
