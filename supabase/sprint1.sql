-- Sprint 1 fixes. Run AFTER schema.sql + auth.sql.

-- Fix L: finance documents readable/writable by ADMIN and FINANCE (was ADMIN only).
drop policy if exists finance_admin on finance_docs;
drop policy if exists finance_rw on finance_docs;
create policy finance_rw on finance_docs for all
  using (
    is_admin()
    or exists (select 1 from users u where u.id = app_uid() and u.role = 'FINANCE')
  )
  with check (
    is_admin()
    or exists (select 1 from users u where u.id = app_uid() and u.role = 'FINANCE')
  );
