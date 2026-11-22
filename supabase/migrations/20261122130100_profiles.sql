-- Profiles: one row per auth user, carrying the role and the preferred language.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Copies of auth.users columns, kept in sync by trigger, so the back-office can list
  -- users and their invitation status under RLS without the Auth admin API.
  email text not null,
  email_confirmed_at timestamptz,
  full_name text not null default '',
  role public.user_role not null default 'learner',
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_trainers_idx on public.profiles (id) where role = 'trainer';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Role check used by every policy. Reads the table (not a token claim), so a role change or
-- a deleted account takes effect on the very next query.
-- ---------------------------------------------------------------------------------------------
create function private.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'trainer'
  );
$$;

revoke all on function private.is_trainer() from public;
grant execute on function private.is_trainer() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
-- The role column is deliberately not writable through the API: see set_user_role().
grant update (full_name, locale) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_trainer()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_trainer()))
  with check (id = (select auth.uid()) or (select private.is_trainer()));

-- ---------------------------------------------------------------------------------------------
-- Keep profiles in step with auth.users
-- ---------------------------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The role is never read from user metadata, which users can edit themselves.
  insert into public.profiles (id, email, email_confirmed_at, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    new.email_confirmed_at,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    case
      when new.raw_user_meta_data ->> 'locale' in ('pt', 'en')
        then new.raw_user_meta_data ->> 'locale'
      else 'pt'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set email = coalesce(new.email, ''),
      email_confirmed_at = new.email_confirmed_at
  where p.id = new.id
    and (p.email is distinct from coalesce(new.email, '')
      or p.email_confirmed_at is distinct from new.email_confirmed_at);
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_user_updated();

-- ---------------------------------------------------------------------------------------------
-- Role changes
-- ---------------------------------------------------------------------------------------------

-- Refuses to demote or delete the last trainer, whichever path the change takes
-- (the RPC below, the secret key, the SQL editor, or the cascade from deleting the auth user).
create function private.guard_last_trainer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'trainer')
     or (tg_op = 'UPDATE' and old.role = 'trainer' and new.role <> 'trainer') then
    -- Serialise concurrent demotions so two trainers cannot demote each other at once.
    perform pg_advisory_xact_lock(hashtextextended('private.guard_last_trainer', 0));
    if not exists (
      select 1 from public.profiles p where p.role = 'trainer' and p.id <> old.id
    ) then
      raise exception 'cannot remove the last trainer'
        using errcode = 'P0001', hint = 'last_trainer';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_last_trainer
  before update of role or delete on public.profiles
  for each row execute function private.guard_last_trainer();

create function private.set_user_role(target uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_trainer()) then
    raise exception 'only trainers can change roles' using errcode = '42501';
  end if;

  update public.profiles set role = new_role where id = target;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function private.set_user_role(uuid, public.user_role) from public;
grant execute on function private.set_user_role(uuid, public.user_role) to authenticated;

-- Thin wrapper so the definer function stays out of the API-exposed schema.
create function public.set_user_role(target uuid, new_role public.user_role)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_user_role(target, new_role);
$$;

revoke all on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
