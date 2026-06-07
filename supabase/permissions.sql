-- Section permissions matrix (super-admin editable). Overrides the static
-- defaults per (section, role). Run AFTER schema.sql.

create table if not exists section_permissions (
  section    text not null,
  role       role not null,
  allowed    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (section, role)
);
alter table section_permissions enable row level security;
-- Accessed via the service-role server client; RLS on with no policy denies
-- direct anon/authenticated access by default.
