-- Discord phase 2a: DM attachments, block/mute, DND + profile visibility.
-- Run AFTER discord.sql / discord2.sql.

-- 1) One optional attachment per direct message (base64 data URL, like documents).
alter table dm_messages add column if not exists attachment_url  text;
alter table dm_messages add column if not exists attachment_name text;
alter table dm_messages add column if not exists attachment_type text;

-- 2) Do-Not-Disturb + profile visibility.
alter table user_preferences add column if not exists dnd boolean not null default false;
-- visibility ∈ 'everyone' | 'team' | 'nobody'
alter table user_preferences add column if not exists visibility text not null default 'everyone';

-- 3) Block / mute relationships (kind = 'BLOCK' | 'MUTE').
create table if not exists user_blocks (
  blocker_id  text not null references users(id) on delete cascade,
  target_id   text not null references users(id) on delete cascade,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, target_id, kind)
);
create index if not exists idx_user_blocks_blocker on user_blocks(blocker_id);
alter table user_blocks enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.
