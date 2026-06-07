-- Create (or repair) a confirmed ADMIN account for testing.
-- Prerequisites: run schema.sql then auth.sql first.
-- Run in the Supabase SQL editor. Idempotent: re-running repairs an existing row.
-- ⚠️ CHANGE the email/password below before running, and rotate after testing.
--
-- Why the token columns are set to '': Supabase Auth (GoTrue) scans these
-- string columns when you sign in. If they are NULL (the default on a manual
-- insert), login fails with "Database error querying schema". They MUST be ''.

do $$
declare
  uid uuid := gen_random_uuid();
  user_email text := 'admin@rebuild.tn';
  user_password text := 'Rebuild!2026';
  existing uuid;
begin
  select id into existing from auth.users where email = user_email;

  if existing is not null then
    -- Repair an account created by an earlier (buggy) run.
    update auth.users set
      encrypted_password         = crypt(user_password, gen_salt('bf')),
      email_confirmed_at         = coalesce(email_confirmed_at, now()),
      confirmation_token         = coalesce(confirmation_token, ''),
      recovery_token             = coalesce(recovery_token, ''),
      email_change               = coalesce(email_change, ''),
      email_change_token_new     = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change               = coalesce(phone_change, ''),
      phone_change_token         = coalesce(phone_change_token, ''),
      reauthentication_token     = coalesce(reauthentication_token, '')
    where id = existing;

    insert into public.profiles (id, email, name, role)
    values (existing, user_email, 'REBUILD Admin', 'ADMIN')
    on conflict (id) do update set role = 'ADMIN', name = excluded.name;

    raise notice 'Repaired existing admin: % (password reset to the one above)', user_email;
    return;
  end if;

  -- 1) Auth user (email pre-confirmed, all token columns set to '').
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', user_email,
    crypt(user_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', 'REBUILD Admin'),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  -- 2) Email identity (required for password login).
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', user_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- 3) App profile with the ADMIN role.
  insert into public.profiles (id, email, name, role)
  values (uid, user_email, 'REBUILD Admin', 'ADMIN')
  on conflict (id) do update set role = 'ADMIN', name = excluded.name;

  raise notice 'Admin created: % / % (change the password!)', user_email, user_password;
end $$;
