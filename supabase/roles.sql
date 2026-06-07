-- Add the new staff roles to the `role` enum (spec personas).
-- Run in the Supabase SQL editor. ALTER TYPE ... ADD VALUE is idempotent with
-- IF NOT EXISTS and cannot run inside a transaction block (the editor is fine).

alter type role add value if not exists 'PM';
alter type role add value if not exists 'QA';
alter type role add value if not exists 'DESIGNER';
alter type role add value if not exists 'SALES';
alter type role add value if not exists 'FINANCE';
alter type role add value if not exists 'SUPPORT';
