# Supabase database

SQL to provision the REBUILD Engineering OS database on Supabase / Postgres.

## Apply

In the Supabase dashboard → SQL editor, run `schema.sql` then `seed.sql`.
Or from a terminal with the connection string:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then set in `.env.local` (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## What's here

- `schema.sql` — enums, tables (spec §14 + finance/documents/meetings/preferences),
  indexes, `updated_at` triggers, and Row-Level Security policies (spec §18).
- `seed.sql` — the same sample data the app ships with (users, workspaces,
  projects, tickets, sprints, milestones, git, finance, meetings).

## RLS model

The Next.js server uses the **service role key** (bypasses RLS) and enforces
authorization in `lib/auth.ts`. The included policies protect any **direct
client** (anon-key) access: a request must declare the acting user with

```sql
select set_config('app.user_id', '<user-id>', true);
```

and is then limited to the workspaces they belong to (`is_member()`), their own
notifications/preferences, and admin-only finance tables (`is_admin()`).

## Cutover from the in-memory store

`lib/supabase.ts` exposes `supabaseEnabled()`, `supabaseAdmin()` and
`supabaseBrowser()`. The remaining step to "delete all mock" is to replace the
reads/writes in `lib/queries.ts` and `lib/mutations.ts` (and make the route
handlers / server components `await` them) with `supabaseAdmin()` queries —
column names map 1:1 to the snake_case schema here. Do this once the database
above is provisioned so it can be verified end-to-end.
