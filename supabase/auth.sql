-- REBUILD Engineering OS — authentication layer (run AFTER schema.sql).
-- Links Supabase Auth (auth.users) to an app `profiles` table carrying the
-- RBAC role. A trigger provisions a profile on every sign-up.
--   psql "$DATABASE_URL" -f supabase/auth.sql

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text not null default '',
  role        role not null default 'ENGINEER',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- A signed-in user can read and update only their own profile.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile when a new auth user signs up.
-- The project owner email is bootstrapped as ADMIN; everyone else ENGINEER.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when new.email = 'azizghed10@gmail.com' then 'ADMIN'::role else 'ENGINEER'::role end
  )
  on conflict (id) do nothing;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper used by RLS policies on app tables: the role of the current auth user.
create or replace function auth_role() returns role as $$
  select role from public.profiles where id = auth.uid()
$$ language sql stable security definer set search_path = public;
