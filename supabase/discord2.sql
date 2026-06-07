-- Discord phase 2: presence heartbeat, message reactions, private member notes.
-- Run AFTER discord.sql.

-- 1) Live presence via a heartbeat (robust on serverless; "online" = recent).
alter table users add column if not exists last_seen_at timestamptz;

-- 2) Emoji reactions on direct messages.
create table if not exists dm_reactions (
  id          text primary key,
  message_id  text not null references dm_messages(id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists idx_dm_reactions_msg on dm_reactions(message_id);

-- 3) Private notes a user keeps about another member (only the author sees them).
create table if not exists member_notes (
  author_id   text not null references users(id) on delete cascade,
  subject_id  text not null references users(id) on delete cascade,
  content     text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (author_id, subject_id)
);

alter table dm_reactions enable row level security;
alter table member_notes enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.
