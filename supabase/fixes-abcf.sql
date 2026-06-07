-- Critical logical fixes A/B/C/F. Run AFTER schema.sql (+ p0-tickets.sql).

-- ── B: unify PR source (mirror GitHub PRs into Supabase) ──────────────────
-- GitHub authors have no internal user id, so author_id must allow null.
alter table pull_requests alter column author_id drop not null;
-- Upsert key for mirroring by (workspace, number).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pull_requests_ws_number_key') then
    alter table pull_requests add constraint pull_requests_ws_number_key unique (workspace_id, number);
  end if;
end $$;

-- ── F: atomic, unique ticket numbers ──────────────────────────────────────
-- Per-project counter incremented atomically; seed past the current max.
alter table projects add column if not exists ticket_seq int not null default 100;

do $$
declare p record; m int;
begin
  for p in select id from projects loop
    select coalesce(max(nullif(split_part(short_id, '-', 2), '')::int), 100) into m
      from tickets where project_id = p.id;
    update projects set ticket_seq = greatest(ticket_seq, m) where id = p.id;
  end loop;
end $$;

-- Atomic allocator: returns the next ticket number for a project.
create or replace function next_ticket_number(p_project_id text)
returns int as $$
  update projects set ticket_seq = ticket_seq + 1
  where id = p_project_id
  returning ticket_seq;
$$ language sql;

-- Safety net against duplicate keys.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tickets_project_shortid_key') then
    alter table tickets add constraint tickets_project_shortid_key unique (project_id, short_id);
  end if;
end $$;
