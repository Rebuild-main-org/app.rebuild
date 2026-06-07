-- SHOULD: time tracking. Run AFTER schema.sql + p0-tickets.sql.
-- Logs time per ticket so work can be billed at the time spent.

create table if not exists time_entries (
  id         text primary key,
  ticket_id  text not null references tickets(id) on delete cascade,
  user_id    text not null references users(id),
  minutes    int  not null check (minutes > 0),
  note       text,
  spent_on   date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_time_entries_ticket on time_entries(ticket_id);
create index if not exists idx_time_entries_user on time_entries(user_id);

alter table time_entries enable row level security;

-- Optional: original estimate on a ticket (hours), for estimate-vs-actual.
alter table tickets add column if not exists estimate_hours numeric;
