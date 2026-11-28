-- Course trainers: who teaches each course.
--
-- Every trainer still manages every course: this says whose course it is. A course's learners
-- are shown its trainers by name, and what they write to them (see the next migration) is
-- theirs to answer first.
--
-- A row only counts while its person is a trainer, as an enrolment only counts while its person
-- is a learner. Nothing is deleted when a role changes, so nothing has to be put back when it
-- changes again; whoever reads this table checks the role.

create table public.course_trainers (
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create index course_trainers_user_idx on public.course_trainers (user_id);

-- ---------------------------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------------------------
alter table public.course_trainers enable row level security;

revoke all on table public.course_trainers from anon, authenticated, service_role;
-- A row is added or removed, never changed.
grant select, insert, delete on table public.course_trainers to authenticated;
grant select, insert, update, delete on table public.course_trainers to service_role;

-- Only trainers need the table itself: what a learner is shown comes from the function below.
create policy course_trainers_read on public.course_trainers for select to authenticated
  using ((select private.is_trainer()));
create policy course_trainers_insert on public.course_trainers for insert to authenticated
  with check ((select private.is_trainer()));
create policy course_trainers_delete on public.course_trainers for delete to authenticated
  using ((select private.is_trainer()));

-- ---------------------------------------------------------------------------------------------
-- The trainers of a course, by name
-- ---------------------------------------------------------------------------------------------
-- For whoever may open the course: its learners while it is not a draft, and every trainer.
-- A learner cannot read anyone else's profile, so this is how a trainer's name reaches them,
-- and the name is all that does: no address, and nothing about people who are not trainers.
create function private.course_trainer_names(target_course_id uuid)
returns table (user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name
  from public.course_trainers ct
  join public.profiles p on p.id = ct.user_id
  where ct.course_id = target_course_id
    and p.role = 'trainer'
    and (
      (select private.is_trainer())
      or target_course_id in (select private.accessible_course_ids())
    );
$$;

revoke all on function private.course_trainer_names(uuid) from public;
grant execute on function private.course_trainer_names(uuid) to authenticated;

create function public.course_trainer_names(target_course_id uuid)
returns table (user_id uuid, full_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.course_trainer_names(target_course_id);
$$;

revoke all on function public.course_trainer_names(uuid) from public, anon;
grant execute on function public.course_trainer_names(uuid) to authenticated;
