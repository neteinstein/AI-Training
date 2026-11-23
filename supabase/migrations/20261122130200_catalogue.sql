-- Catalogue: areas, levels, courses, and who is enrolled in what.
--
-- Bilingual rule for the catalogue: names and titles are required in both languages, and a
-- course needs both summaries before it can leave draft.

-- ---------------------------------------------------------------------------------------------
-- Areas (teachers, medical doctors, ...)
-- ---------------------------------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_pt text not null check (btrim(name_pt) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  description_pt text,
  description_en text,
  -- Key into the curated palette and icon set defined in the app (src/config/site.ts).
  color text not null default 'forest'
    check (color in ('forest', 'terracotta', 'ocean', 'plum', 'ochre', 'indigo', 'rose', 'olive')),
  icon text not null default 'shapes' check (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger areas_set_updated_at
  before update on public.areas
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Levels (introductory, advanced, ...)
-- ---------------------------------------------------------------------------------------------
create table public.levels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_pt text not null check (btrim(name_pt) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  description_pt text,
  description_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger levels_set_updated_at
  before update on public.levels
  for each row execute function private.set_updated_at();

-- The two levels every installation starts with. Trainers can rename them or add more.
insert into public.levels (slug, name_pt, name_en, description_pt, description_en, sort_order)
values
  ('introductory', 'Iniciação', 'Introductory',
   'Sem conhecimentos prévios. Dos conceitos essenciais às primeiras utilizações.',
   'No prior knowledge needed. From the essential concepts to first practical uses.',
   10),
  ('advanced', 'Avançado', 'Advanced',
   'Para quem já usa IA no dia a dia e quer integrá-la no seu trabalho com método.',
   'For people who already use AI day to day and want to build it into their work methodically.',
   20)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  area_id uuid not null references public.areas (id) on delete restrict,
  level_id uuid not null references public.levels (id) on delete restrict,
  -- draft:     trainers only
  -- published: public catalogue + enrolled learners
  -- unlisted:  hidden from the public site, enrolled learners keep access
  status public.course_status not null default 'draft',
  title_pt text not null check (btrim(title_pt) <> ''),
  title_en text not null check (btrim(title_en) <> ''),
  summary_pt text,
  summary_en text,
  description_pt text, -- Markdown
  description_en text, -- Markdown
  duration_hours numeric(5, 1) check (duration_hours is null or duration_hours > 0),
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_summaries_before_leaving_draft check (
    status = 'draft'
    or (nullif(btrim(summary_pt), '') is not null and nullif(btrim(summary_en), '') is not null)
  )
);

create index courses_area_idx on public.courses (area_id);
create index courses_level_idx on public.courses (level_id);
create index courses_status_idx on public.courses (status);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Enrolments: which learner can open which course
-- ---------------------------------------------------------------------------------------------
create table public.enrollments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- A course with learners cannot be deleted by accident; unlist it instead.
  course_id uuid not null references public.courses (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index enrollments_course_idx on public.enrollments (course_id);
create index enrollments_created_by_idx on public.enrollments (created_by);

-- ---------------------------------------------------------------------------------------------
-- Helpers for policies
-- ---------------------------------------------------------------------------------------------

-- Every course the current user is enrolled in, whatever its status.
create function private.enrolled_course_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.course_id
  from public.enrollments e
  where e.user_id = (select auth.uid());
$$;

-- Courses whose content the current user may open: enrolled, and not a draft.
create function private.accessible_course_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.course_id
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  where e.user_id = (select auth.uid())
    and c.status in ('published', 'unlisted');
$$;

revoke all on function private.enrolled_course_ids() from public;
revoke all on function private.accessible_course_ids() from public;
grant execute on function private.enrolled_course_ids() to authenticated, service_role;
grant execute on function private.accessible_course_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------------------------
alter table public.areas enable row level security;
alter table public.levels enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;

revoke all on table public.areas, public.levels, public.courses, public.enrollments
  from anon, authenticated, service_role;

grant select on table public.areas, public.levels, public.courses to anon;
grant select, insert, update, delete
  on table public.areas, public.levels, public.courses, public.enrollments
  to authenticated, service_role;

-- Areas and levels are public reference data; only trainers change them.
create policy areas_read_anon on public.areas for select to anon using (true);
create policy areas_read on public.areas for select to authenticated using (true);
create policy areas_insert on public.areas for insert to authenticated
  with check ((select private.is_trainer()));
create policy areas_update on public.areas for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy areas_delete on public.areas for delete to authenticated
  using ((select private.is_trainer()));

create policy levels_read_anon on public.levels for select to anon using (true);
create policy levels_read on public.levels for select to authenticated using (true);
create policy levels_insert on public.levels for insert to authenticated
  with check ((select private.is_trainer()));
create policy levels_update on public.levels for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy levels_delete on public.levels for delete to authenticated
  using ((select private.is_trainer()));

-- Courses: visitors see published ones; learners also see unlisted ones they are enrolled in.
create policy courses_read_anon on public.courses for select to anon
  using (status = 'published');
create policy courses_read on public.courses for select to authenticated
  using (
    status = 'published'
    or (select private.is_trainer())
    or (status = 'unlisted' and id in (select private.enrolled_course_ids()))
  );
create policy courses_insert on public.courses for insert to authenticated
  with check ((select private.is_trainer()));
create policy courses_update on public.courses for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy courses_delete on public.courses for delete to authenticated
  using ((select private.is_trainer()));

-- Enrolments: learners see their own; only trainers create or remove them.
create policy enrollments_read on public.enrollments for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_trainer()));
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check ((select private.is_trainer()));
create policy enrollments_update on public.enrollments for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy enrollments_delete on public.enrollments for delete to authenticated
  using ((select private.is_trainer()));

-- ---------------------------------------------------------------------------------------------
-- Ordering (run as the caller, so the policies above apply)
-- ---------------------------------------------------------------------------------------------
create function public.reorder_areas(ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.areas a
  set sort_order = (t.position * 10)::integer
  from unnest(ordered_ids) with ordinality as t (id, position)
  where a.id = t.id;
$$;

create function public.reorder_levels(ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.levels l
  set sort_order = (t.position * 10)::integer
  from unnest(ordered_ids) with ordinality as t (id, position)
  where l.id = t.id;
$$;

revoke all on function public.reorder_areas(uuid[]) from public, anon;
revoke all on function public.reorder_levels(uuid[]) from public, anon;
grant execute on function public.reorder_areas(uuid[]) to authenticated;
grant execute on function public.reorder_levels(uuid[]) to authenticated;
