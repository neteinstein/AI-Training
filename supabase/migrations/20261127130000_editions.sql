-- Editions: dated runs of a course, each with its own learners and its own view of the content.
--
-- Every edition shows the course's modules and materials. For one edition a trainer can hide
-- some of them, and add materials that only that edition sees. A learner is in one edition of
-- a course at a time; a trainer can move them to another.

-- ---------------------------------------------------------------------------------------------
-- Editions
-- ---------------------------------------------------------------------------------------------
create table public.editions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  -- Catalogue rule: an edition can be shown on the public site, so both languages are required.
  name_pt text not null check (btrim(name_pt) <> ''),
  name_en text not null check (btrim(name_en) <> ''),
  -- Information for people: dates never open or close access. Removing a learner does.
  starts_on date,
  ends_on date,
  -- Listed editions of published courses are shown on the public course page, to anyone.
  -- Nothing private may ever be added to this table.
  is_listed boolean not null default false,
  -- Where an enrolment goes when no edition is named. A preference: at most one per course.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets an enrolment point at (edition, course) together, so the two can never disagree.
  constraint editions_id_course_key unique (id, course_id),
  constraint editions_dates_in_order check (
    ends_on is null or (starts_on is not null and ends_on >= starts_on)
  ),
  constraint editions_listed_needs_start check (not is_listed or starts_on is not null)
);

create index editions_course_idx on public.editions (course_id, starts_on);
create unique index editions_one_default_per_course on public.editions (course_id)
  where is_default;

create trigger editions_set_updated_at
  before update on public.editions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Existing data: every course gets one edition, and every enrolment moves into it. The rules
-- that depend on that come after.
-- ---------------------------------------------------------------------------------------------
insert into public.editions (course_id, name_pt, name_en, is_default)
select c.id, 'Edição geral', 'General edition', true
from public.courses c;

alter table public.enrollments add column edition_id uuid;

update public.enrollments e
set edition_id = ed.id
from public.editions ed
where ed.course_id = e.course_id and ed.is_default;

alter table public.enrollments alter column edition_id set not null;

-- An edition with learners cannot be deleted, as a course with learners cannot.
alter table public.enrollments
  add constraint enrollments_edition_fkey
  foreign key (edition_id, course_id)
  references public.editions (id, course_id)
  on delete restrict;

create index enrollments_edition_idx on public.enrollments (edition_id);

-- ---------------------------------------------------------------------------------------------
-- What keeps the shape: a new course starts with an edition, an enrolment that names none goes
-- to the course's default one, and a course never loses its last edition.
-- ---------------------------------------------------------------------------------------------
create function private.create_default_edition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.editions (course_id, name_pt, name_en, is_default)
  values (new.id, 'Edição geral', 'General edition', true);
  return null;
end;
$$;

create trigger courses_create_default_edition
  after insert on public.courses
  for each row execute function private.create_default_edition();

-- The application names the edition. This is for writers that do not: the default edition, or
-- else the oldest.
create function private.enrollment_default_edition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.edition_id is null then
    new.edition_id := (
      select ed.id
      from public.editions ed
      where ed.course_id = new.course_id
      order by ed.is_default desc, ed.created_at, ed.id
      limit 1
    );
  end if;
  return new;
end;
$$;

create trigger enrollments_default_edition
  before insert on public.enrollments
  for each row execute function private.enrollment_default_edition();

-- Deleting the course itself is not hindered: by the time the cascade reaches its editions,
-- the course row is already gone.
create function private.guard_last_edition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.courses c where c.id = old.course_id) then
    return old;
  end if;
  -- One at a time per course, so the last two editions cannot be deleted at the same moment.
  perform pg_advisory_xact_lock(
    hashtextextended('private.guard_last_edition:' || old.course_id::text, 0)
  );
  if not exists (
    select 1
    from public.editions ed
    where ed.course_id = old.course_id and ed.id <> old.id
  ) then
    raise exception 'a course keeps at least one edition'
      using errcode = 'P0001', hint = 'last_edition';
  end if;
  return old;
end;
$$;

create trigger editions_guard_last
  before delete on public.editions
  for each row execute function private.guard_last_edition();

-- When the default edition is deleted, the oldest one left takes its place, so a course goes
-- on saying where its new learners go. (While a whole course is being deleted, none is left.)
create function private.promote_default_edition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.editions ed
  set is_default = true
  where ed.id = (
    select other.id
    from public.editions other
    where other.course_id = old.course_id
    order by other.created_at, other.id
    limit 1
  );
  return null;
end;
$$;

create trigger editions_promote_default
  after delete on public.editions
  for each row
  when (old.is_default)
  execute function private.promote_default_edition();

-- ---------------------------------------------------------------------------------------------
-- Materials of one edition only, and course materials an edition hides
-- ---------------------------------------------------------------------------------------------
-- NULL: a material of the course, shown in every edition. Otherwise: of that edition only.
-- Cascade, never SET NULL: that would suddenly show the material to everyone.
alter table public.materials
  add column edition_id uuid references public.editions (id) on delete cascade;

create index materials_edition_idx on public.materials (edition_id) where edition_id is not null;

create function private.check_material_edition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.edition_id is not null and not exists (
    select 1
    from public.modules mo
    join public.editions ed on ed.course_id = mo.course_id
    where mo.id = new.module_id and ed.id = new.edition_id
  ) then
    raise exception 'the edition belongs to another course' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger materials_check_edition
  before insert or update of edition_id, module_id on public.materials
  for each row execute function private.check_material_edition();

create table public.edition_hidden_materials (
  edition_id uuid not null references public.editions (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (edition_id, material_id)
);

create index edition_hidden_materials_material_idx
  on public.edition_hidden_materials (material_id);

create function private.check_hidden_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.materials mt
    join public.modules mo on mo.id = mt.module_id
    join public.editions ed on ed.course_id = mo.course_id
    where mt.id = new.material_id and ed.id = new.edition_id and mt.edition_id is null
  ) then
    raise exception 'only a material of the same course, shown in every edition, can be hidden'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger edition_hidden_materials_check
  before insert or update on public.edition_hidden_materials
  for each row execute function private.check_hidden_material();

-- A material that becomes one edition's own leaves every hidden-list. Left behind, a row for
-- that same edition would hide the material from the only people meant to see it.
create function private.clear_hidden_of_edition_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.edition_hidden_materials h where h.material_id = new.id;
  return null;
end;
$$;

create trigger materials_clear_hidden
  after update of edition_id on public.materials
  for each row
  when (new.edition_id is not null and old.edition_id is distinct from new.edition_id)
  execute function private.clear_hidden_of_edition_material();

revoke all on function private.create_default_edition() from public;
revoke all on function private.enrollment_default_edition() from public;
revoke all on function private.guard_last_edition() from public;
revoke all on function private.promote_default_edition() from public;
revoke all on function private.check_material_edition() from public;
revoke all on function private.check_hidden_material() from public;
revoke all on function private.clear_hidden_of_edition_material() from public;

-- ---------------------------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------------------------
-- The editions of the courses the current user may open.
create function private.my_edition_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.edition_id
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  where e.user_id = (select auth.uid())
    and c.status in ('published', 'unlisted');
$$;

revoke all on function private.my_edition_ids() from public;
grant execute on function private.my_edition_ids() to authenticated, service_role;

alter table public.editions enable row level security;
alter table public.edition_hidden_materials enable row level security;

revoke all on table public.editions, public.edition_hidden_materials
  from anon, authenticated, service_role;

grant select on table public.editions to anon;
grant select, insert, delete on table public.editions to authenticated;
-- An edition never changes course: course_id is not writable through the API.
grant update (name_pt, name_en, starts_on, ends_on, is_listed, is_default)
  on table public.editions to authenticated;
grant select, insert, update, delete on table public.editions to service_role;

grant select, insert, delete on table public.edition_hidden_materials to authenticated;
grant select, insert, update, delete on table public.edition_hidden_materials to service_role;

-- Visitors cannot use the private schema, so their policy calls no helper. The policies on
-- courses must never look at editions in return.
create policy editions_read_anon on public.editions for select to anon
  using (
    is_listed
    and course_id in (select c.id from public.courses c where c.status = 'published')
  );
-- Learners see the edition they are in, and what visitors see.
create policy editions_read on public.editions for select to authenticated
  using (
    (select private.is_trainer())
    or id in (select private.my_edition_ids())
    or (is_listed
      and course_id in (select c.id from public.courses c where c.status = 'published'))
  );
create policy editions_insert on public.editions for insert to authenticated
  with check ((select private.is_trainer()));
create policy editions_update on public.editions for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy editions_delete on public.editions for delete to authenticated
  using ((select private.is_trainer()));

-- Only trainers need this table: what a learner sees is decided below.
create policy edition_hidden_materials_read on public.edition_hidden_materials
  for select to authenticated using ((select private.is_trainer()));
create policy edition_hidden_materials_insert on public.edition_hidden_materials
  for insert to authenticated with check ((select private.is_trainer()));
create policy edition_hidden_materials_delete on public.edition_hidden_materials
  for delete to authenticated using ((select private.is_trainer()));

-- Makes one edition the course's default (runs as the caller, so the policies above apply).
create function public.set_default_edition(target_edition_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.editions ed
  set is_default = false
  where ed.is_default
    and ed.id <> target_edition_id
    and ed.course_id = (select t.course_id from public.editions t where t.id = target_edition_id);
  update public.editions ed
  set is_default = true
  where ed.id = target_edition_id and not ed.is_default;
$$;

revoke all on function public.set_default_edition(uuid) from public, anon;
grant execute on function public.set_default_edition(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- THE definition of which materials a learner may see. The rule on materials, the rule on
-- stored files, and everything added later (progress, quizzes) read these two views, so they
-- cannot disagree. No API role can select them: only the functions below do.
-- ---------------------------------------------------------------------------------------------
-- What an edition shows: the visible materials of its course that it does not hide, and its own.
create view private.edition_materials as
select
  ed.id as edition_id,
  ed.course_id,
  mo.id as module_id,
  mt.id as material_id,
  mt.kind,
  mt.storage_path
from public.editions ed
join public.modules mo on mo.course_id = ed.course_id
join public.materials mt on mt.module_id = mo.id
where mt.is_published
  and (mt.edition_id is null or mt.edition_id = ed.id)
  and not exists (
    select 1
    from public.edition_hidden_materials h
    where h.edition_id = ed.id and h.material_id = mt.id
  );

-- What a learner sees: what their edition shows, while the course is not a draft.
create view private.learner_materials as
select
  e.user_id,
  em.edition_id,
  em.course_id,
  em.module_id,
  em.material_id,
  em.kind,
  em.storage_path
from public.enrollments e
join public.courses c on c.id = e.course_id
join private.edition_materials em on em.edition_id = e.edition_id
where c.status in ('published', 'unlisted');

revoke all on table private.edition_materials, private.learner_materials
  from public, anon, authenticated, service_role;

create function private.visible_material_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select lm.material_id
  from private.learner_materials lm
  where lm.user_id = (select auth.uid());
$$;

revoke all on function private.visible_material_ids() from public;
grant execute on function private.visible_material_ids() to authenticated, service_role;

drop policy materials_read on public.materials;
create policy materials_read on public.materials for select to authenticated
  using (
    (select private.is_trainer())
    or id in (select private.visible_material_ids())
  );

-- Same name and arguments as before, so the rule on stored files that calls it stays as it is.
create or replace function private.can_read_material_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.learner_materials lm
    where lm.user_id = (select auth.uid())
      and lm.kind = 'file'
      and lm.storage_path = object_name
  );
$$;

-- Nothing uses it any more, and keeping it would invite a second definition.
drop function private.accessible_module_ids();
