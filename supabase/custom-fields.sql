-- COULD: custom fields on tickets, defined per project. Run AFTER schema.sql.

do $$ begin
  create type custom_field_type as enum ('TEXT','NUMBER','SELECT','DATE');
exception when duplicate_object then null; end $$;

create table if not exists custom_fields (
  id          text primary key,
  project_id  text not null references projects(id) on delete cascade,
  name        text not null,
  type        custom_field_type not null default 'TEXT',
  options     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_custom_fields_project on custom_fields(project_id);

create table if not exists ticket_field_values (
  field_id  text not null references custom_fields(id) on delete cascade,
  ticket_id text not null references tickets(id) on delete cascade,
  value     text not null default '',
  primary key (field_id, ticket_id)
);
create index if not exists idx_field_values_ticket on ticket_field_values(ticket_id);

alter table custom_fields enable row level security;
alter table ticket_field_values enable row level security;
