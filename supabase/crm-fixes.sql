-- CRM → workspace → project hardening (P0/P1).
-- Run this whole file in the Supabase SQL editor.

-- ── P0-1: unique short code per workspace ───────────────────────────────────
-- Ticket ids are "<short_code>-<n>" with a per-project counter, so two projects
-- in the same workspace sharing a short code produce colliding ids (e.g. two
-- "DB-1"). Enforce one short code per workspace.

-- 1) De-duplicate the known Med.tn clash: keep "Database & Schema" = DB, rename
--    "Database Schema & Migrations" to DBM (and migrate its existing ticket ids).
update tickets t
   set short_id = 'DBM' || substr(t.short_id, 3)
  from projects p
 where t.project_id = p.id
   and p.short_code = 'DB'
   and p.name = 'Database Schema & Migrations';

update projects
   set short_code = 'DBM'
 where short_code = 'DB'
   and name = 'Database Schema & Migrations';

-- 2) Generic safety net: if any other duplicates remain, suffix them so the
--    unique index below can be created. Newest project keeps the bare code.
do $$
declare
  grp record;
  proj record;
  i int;
begin
  for grp in
    select workspace_id, upper(short_code) as code
      from projects
     group by workspace_id, upper(short_code)
    having count(*) > 1
  loop
    i := 0;
    for proj in
      select id, short_code
        from projects
       where workspace_id = grp.workspace_id
         and upper(short_code) = grp.code
       order by start_date asc
    loop
      if i > 0 then
        update projects set short_code = left(proj.short_code, 6) || i where id = proj.id;
      end if;
      i := i + 1;
    end loop;
  end loop;
end $$;

-- 3) Enforce uniqueness going forward (case-insensitive, per workspace).
create unique index if not exists projects_ws_shortcode_key
  on projects (workspace_id, upper(short_code));
