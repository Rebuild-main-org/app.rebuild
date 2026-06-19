-- ============================================================================
-- Phase 3 — BYOK secret vault, per-org settings, GitHub App installs
-- ============================================================================
-- Run after org-foundation.sql.

-- Encrypted secret vault (envelope encryption in lib/secrets.ts). One row per
-- (org, provider). ciphertext = base64(iv|tag|AES-256-GCM data); the key is
-- derived per-org from SECRETS_MASTER_KEY via HKDF. Plaintext is NEVER stored or
-- re-displayed — only last4 + health are readable by members.
create table if not exists org_secrets (
  org_id       uuid not null references organizations(id) on delete cascade,
  provider     text not null,                    -- anthropic | github | stripe | resend | ...
  ciphertext   text not null,
  last4        text,
  health       text not null default 'unknown',  -- valid | invalid | expired | unknown
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (org_id, provider)
);
alter table org_secrets enable row level security;
alter table org_secrets force  row level security;
drop policy if exists org_secrets_member_select on org_secrets;
create policy org_secrets_member_select on org_secrets
  for select using (org_id in (select current_user_org_ids()));
grant select on org_secrets to authenticated;

-- Per-org settings — the tenant-scoped replacement for the single global
-- app_settings (ai_model, cli_model, ai_budget_usd, ...). Global app_settings
-- stays for PLATFORM defaults only.
create table if not exists org_settings (
  org_id     uuid not null references organizations(id) on delete cascade,
  key        text not null,
  value      text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table org_settings enable row level security;
alter table org_settings force  row level security;
drop policy if exists org_settings_member_select on org_settings;
create policy org_settings_member_select on org_settings
  for select using (org_id in (select current_user_org_ids()));
grant select on org_settings to authenticated;

-- Per-org section permissions — replaces the global section_permissions matrix.
create table if not exists org_section_permissions (
  org_id   uuid not null references organizations(id) on delete cascade,
  section  text not null,
  role     text not null,            -- org role: owner|admin|member|guest
  allowed  boolean not null default false,
  primary key (org_id, section, role)
);
alter table org_section_permissions enable row level security;
drop policy if exists org_section_perms_select on org_section_permissions;
create policy org_section_perms_select on org_section_permissions
  for select using (org_id in (select current_user_org_ids()));
grant select on org_section_permissions to authenticated;

-- GitHub App installations per org — replaces the single shared GITHUB_TOKEN.
-- Installation tokens are minted on demand from the App private key
-- (lib/github-app.ts); only the installation id is stored.
create table if not exists org_github_installations (
  org_id          uuid primary key references organizations(id) on delete cascade,
  installation_id bigint not null,
  account_login   text,
  created_at      timestamptz not null default now()
);
alter table org_github_installations enable row level security;
drop policy if exists org_gh_install_select on org_github_installations;
create policy org_gh_install_select on org_github_installations
  for select using (org_id in (select current_user_org_ids()));
grant select on org_github_installations to authenticated;
