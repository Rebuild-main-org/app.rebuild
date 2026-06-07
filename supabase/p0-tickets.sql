-- P0 epics 1 & 2: ticket hierarchy, links, watchers, attachments.
-- Run AFTER schema.sql, in the Supabase SQL editor.
-- (ALTER TYPE ... ADD VALUE cannot run in a transaction block — the editor is fine.)

-- 1) Sub-task type + parent link on tickets.
alter type ticket_type add value if not exists 'SUBTASK';
alter table tickets add column if not exists parent_id text references tickets(id) on delete set null;
create index if not exists idx_tickets_parent on tickets(parent_id);

-- 2) Ticket links (blocks / relates / duplicates) — directional.
do $$ begin
  create type link_type as enum ('BLOCKS','RELATES','DUPLICATES');
exception when duplicate_object then null; end $$;

create table if not exists ticket_links (
  id              text primary key,
  from_ticket_id  text not null references tickets(id) on delete cascade,
  to_ticket_id    text not null references tickets(id) on delete cascade,
  type            link_type not null default 'RELATES',
  created_at      timestamptz not null default now(),
  unique (from_ticket_id, to_ticket_id, type)
);
create index if not exists idx_links_from on ticket_links(from_ticket_id);
create index if not exists idx_links_to on ticket_links(to_ticket_id);

-- 3) Watchers.
create table if not exists ticket_watchers (
  ticket_id  text not null references tickets(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- 4) Ticket attachments (base64 data URL for now; swap to Storage later).
create table if not exists ticket_attachments (
  id              text primary key,
  ticket_id       text not null references tickets(id) on delete cascade,
  name            text not null,
  mime_type       text not null,
  size            bigint not null,
  data_url        text not null,
  uploaded_by_id  text references users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_attach_ticket on ticket_attachments(ticket_id);

alter table ticket_links enable row level security;
alter table ticket_watchers enable row level security;
alter table ticket_attachments enable row level security;
