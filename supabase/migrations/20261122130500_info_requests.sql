-- Information requests sent from the public landing page.
--
-- Visitors never write to this table directly: the form posts to the app, which validates,
-- rate-limits and inserts with the secret key. Trainers read and handle the requests.

create table public.info_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  organisation text check (organisation is null or char_length(organisation) <= 200),
  course_id uuid references public.courses (id) on delete set null,
  message text check (message is null or char_length(message) <= 4000),
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  status public.request_status not null default 'new',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index info_requests_status_idx on public.info_requests (status, created_at desc);
create index info_requests_email_idx on public.info_requests (lower(email), created_at desc);
create index info_requests_course_idx on public.info_requests (course_id);
create index info_requests_handled_by_idx on public.info_requests (handled_by);

create trigger info_requests_set_updated_at
  before update on public.info_requests
  for each row execute function private.set_updated_at();

alter table public.info_requests enable row level security;

revoke all on table public.info_requests from anon, authenticated, service_role;
-- No insert for API users: only the server, with the secret key, creates requests.
grant select, update, delete on table public.info_requests to authenticated;
grant select, insert, update, delete on table public.info_requests to service_role;

create policy info_requests_read on public.info_requests
  for select to authenticated
  using ((select private.is_trainer()));

create policy info_requests_update on public.info_requests
  for update to authenticated
  using ((select private.is_trainer()))
  with check ((select private.is_trainer()));

create policy info_requests_delete on public.info_requests
  for delete to authenticated
  using ((select private.is_trainer()));
