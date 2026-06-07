-- CRM / pre-sales pipeline. Run AFTER schema.sql.
--   psql "$DATABASE_URL" -f supabase/crm.sql   (or paste in the SQL editor)

do $$ begin
  create type lead_stage as enum ('LEAD','QUALIFIED','PROPOSAL','WON','LOST');
exception when duplicate_object then null; end $$;

create table if not exists leads (
  id            text primary key,
  company       text not null,
  contact_name  text not null default '',
  contact_email text not null default '',
  stage         lead_stage not null default 'LEAD',
  value         numeric not null default 0,
  currency      text not null default 'TND',
  source        text not null default '',
  owner_id      text references users(id) on delete set null,
  notes         text,
  workspace_id  text references workspaces(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_owner on leads(owner_id);

drop trigger if exists trg_leads_updated on leads;
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

alter table leads enable row level security;
-- Server uses the service role (bypasses RLS); authorization is enforced in the
-- API routes (crm.view / crm.manage). Direct anon access stays closed by default.

-- Optional sample pipeline:
insert into leads (id, company, contact_name, contact_email, stage, value, currency, source) values
  ('lead_1','Globex','Marie Dupont','marie@globex.com','QUALIFIED',24000,'TND','Referral'),
  ('lead_2','Initech','Peter Gibbons','peter@initech.com','PROPOSAL',38000,'TND','Inbound'),
  ('lead_3','Umbrella','Ada Wong','ada@umbrella.com','LEAD',12000,'TND','Event')
on conflict (id) do nothing;
