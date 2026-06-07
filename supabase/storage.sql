-- MUST-HAVE #3: object storage. Run AFTER schema.sql + p0-tickets.sql.
--
-- 1) In Supabase → Storage, create a PRIVATE bucket named "uploads".
-- 2) Set STORAGE_BUCKET=uploads in your env.
-- 3) Run this file to add the storage_path columns (data_url kept nullable for
--    backward compatibility with already-stored inline files).

alter table documents add column if not exists storage_path text;
alter table documents alter column data_url drop not null;

alter table ticket_attachments add column if not exists storage_path text;
-- ticket_attachments.data_url was already nullable; ensure it stays so:
alter table ticket_attachments alter column data_url drop not null;
