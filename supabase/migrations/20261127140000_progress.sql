-- Progress: which materials each learner has opened, and when.
--
-- A material counts as done the first time its learner opens it. What is counted against is
-- always what that learner's edition shows now (private.edition_materials), so hiding a
-- material, or moving someone to another edition, changes the total and the count together.
-- Trainers are not recorded: they open materials to check them, not to follow the course.

create table public.material_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  -- The first opening: never changed afterwards.
  opened_at timestamptz not null default now(),
  -- The latest opening.
  last_opened_at timestamptz not null default now(),
  -- When it counted as done. Kept apart from opened_at so that the rule for "done" can differ
  -- by kind of material later.
  completed_at timestamptz,
  primary key (user_id, material_id)
);

create index material_progress_material_idx on public.material_progress (material_id);

alter table public.material_progress enable row level security;

revoke all on table public.material_progress from anon, authenticated, service_role;
-- Nobody writes this table through the API: only the function below does, after checking that
-- the material is one the caller may see.
grant select on table public.material_progress to authenticated;
grant select, insert, update, delete on table public.material_progress to service_role;

-- A learner reads their own; trainers read everyone's.
create policy material_progress_read on public.material_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_trainer()));

-- ---------------------------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------------------------
-- Records that the caller opened a material. Answers false, and writes nothing, for a trainer
-- and for a material the caller may not see (whether or not it exists).
create function private.record_material_open(target_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or (select private.is_trainer()) then
    return false;
  end if;

  if not exists (
    select 1
    from private.learner_materials lm
    where lm.user_id = v_user and lm.material_id = target_material_id
  ) then
    return false;
  end if;

  insert into public.material_progress as p (user_id, material_id, completed_at)
  values (v_user, target_material_id, now())
  on conflict (user_id, material_id) do update
    set last_opened_at = excluded.last_opened_at
    -- Reloading a page within a minute writes nothing.
    where p.last_opened_at < excluded.last_opened_at - interval '1 minute';
  return true;
end;
$$;

revoke all on function private.record_material_open(uuid) from public;
grant execute on function private.record_material_open(uuid) to authenticated;

create function public.record_material_open(target_material_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.record_material_open(target_material_id);
$$;

revoke all on function public.record_material_open(uuid) from public, anon;
grant execute on function public.record_material_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reading: a learner's own courses
-- ---------------------------------------------------------------------------------------------
-- One row per course the caller is enrolled in and may open. It runs with the caller's own
-- rights: the rule on materials already is "what I may see", so nothing more is needed. A
-- course with nothing to see yet has no row.
create view public.my_course_progress
with (security_invoker = true)
as
select
  e.course_id,
  e.edition_id,
  count(mt.id)::integer as total_materials,
  count(p.completed_at)::integer as done_materials,
  max(p.last_opened_at) as last_activity_at
from public.enrollments e
join public.modules mo on mo.course_id = e.course_id
join public.materials mt on mt.module_id = mo.id
left join public.material_progress p
  on p.user_id = e.user_id and p.material_id = mt.id
where e.user_id = (select auth.uid())
group by e.course_id, e.edition_id;

revoke all on table public.my_course_progress from anon, authenticated, service_role;
grant select on table public.my_course_progress to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reading: trainers
-- ---------------------------------------------------------------------------------------------
-- These work out what someone else sees, which the caller's own rules cannot express, so they
-- read the single definition directly. Each answers nothing to anyone but a trainer.

-- One row per learner of a course. The total is what that learner's edition shows.
create function private.course_progress(target_course_id uuid)
returns table (
  user_id uuid,
  edition_id uuid,
  total_materials integer,
  done_materials integer,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.user_id,
    e.edition_id,
    count(em.material_id)::integer,
    count(p.completed_at)::integer,
    max(p.last_opened_at)
  from public.enrollments e
  left join private.edition_materials em on em.edition_id = e.edition_id
  left join public.material_progress p
    on p.user_id = e.user_id and p.material_id = em.material_id
  where e.course_id = target_course_id
    and (select private.is_trainer())
  group by e.user_id, e.edition_id;
$$;

-- One learner of a course, material by material: only what that learner's edition shows.
create function private.learner_progress(target_course_id uuid, target_user_id uuid)
returns table (
  material_id uuid,
  opened_at timestamptz,
  last_opened_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select em.material_id, p.opened_at, p.last_opened_at, p.completed_at
  from public.enrollments e
  join private.edition_materials em on em.edition_id = e.edition_id
  left join public.material_progress p
    on p.user_id = e.user_id and p.material_id = em.material_id
  where e.course_id = target_course_id
    and e.user_id = target_user_id
    and (select private.is_trainer());
$$;

revoke all on function private.course_progress(uuid) from public;
revoke all on function private.learner_progress(uuid, uuid) from public;
grant execute on function private.course_progress(uuid) to authenticated;
grant execute on function private.learner_progress(uuid, uuid) to authenticated;

create function public.course_progress(target_course_id uuid)
returns table (
  user_id uuid,
  edition_id uuid,
  total_materials integer,
  done_materials integer,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.course_progress(target_course_id);
$$;

create function public.learner_progress(target_course_id uuid, target_user_id uuid)
returns table (
  material_id uuid,
  opened_at timestamptz,
  last_opened_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.learner_progress(target_course_id, target_user_id);
$$;

revoke all on function public.course_progress(uuid) from public, anon;
revoke all on function public.learner_progress(uuid, uuid) from public, anon;
grant execute on function public.course_progress(uuid) to authenticated;
grant execute on function public.learner_progress(uuid, uuid) to authenticated;
