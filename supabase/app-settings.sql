-- App-wide key/value settings (service-role only). First use: the active AI
-- model (`key = 'ai_model'`), which a SUPER_ADMIN sets for everyone from the
-- admin panel. Run AFTER schema.sql.
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
-- Accessed via the service-role server client only.
