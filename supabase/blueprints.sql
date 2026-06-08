-- Phase A (Conception) blueprints: a project goes through Intake → spec
-- validation → AI critique → feasibility → solution design → budgets →
-- prerequisites → plan, and only an APPROVED blueprint may create a workspace.
-- Service-role only. Run AFTER schema.sql.
create table if not exists blueprints (
  id              text primary key,
  title           text not null,
  status          text not null default 'DRAFT',   -- DRAFT | APPROVED | CONVERTED
  spec_yaml       text not null default '',
  answers         text not null default '',          -- human resolutions for the critique loop
  critique        jsonb,                             -- last SpecCritiqueResult
  plan            jsonb,                             -- ScaffoldPlan preview (frozen)
  feasibility     text not null default '',          -- estimate / budget / risks notes
  design_doc      text not null default '',          -- Solution Design + ADRs (+ openapi/db pasted)
  acceptance_yaml text not null default '',          -- budgets & acceptance thresholds
  prereqs         jsonb not null default '{}'::jsonb,-- provisioning checklist booleans
  gates           jsonb not null default '{}'::jsonb,-- { validate, critique, feasibility, design, budgets, prereqs, plan }
  documents       jsonb not null default '[]'::jsonb,-- uploaded files (bucket paths) attached to the blueprint
  figma_url       text not null default '',          -- design link (step 7)
  workspace_id    text,                              -- set when converted
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists blueprints_status_idx on blueprints(status);
alter table blueprints enable row level security;
