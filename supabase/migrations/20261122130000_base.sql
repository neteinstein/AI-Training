-- Base: deny-by-default privileges, a private schema for helpers, shared types.
--
-- Access model for the whole project:
--   * Nothing in `public` is reachable through the Data API unless a migration grants it.
--   * Row Level Security decides which rows each role sees or changes.
--   * Helper functions that must bypass RLS live in `private`, which the API does not expose.

-- New objects created by migrations get no API privileges automatically.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
-- EXECUTE for PUBLIC is a global default and can only be revoked globally.
alter default privileges for role postgres
  revoke execute on functions from public;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.user_role as enum ('learner', 'trainer');
create type public.course_status as enum ('draft', 'published', 'unlisted');
create type public.material_kind as enum ('file', 'video', 'embed', 'link', 'page');
create type public.request_status as enum ('new', 'contacted', 'invited', 'archived');

-- Keeps `updated_at` current on every table that has one.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
