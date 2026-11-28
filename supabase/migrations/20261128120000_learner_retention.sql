-- How long a learner keeps access, and how long their data is kept.
--
-- A learner's last training day is the latest day among all their enrolments: for each one, the
-- last day of its edition, else its first day, else the day the course starts. Enrolments with
-- none of those days do not count. Days are on the site's clock (Lisbon).
--
--   * Access to the platform is open up to and including two months after that day, and closed
--     from the day after.
--   * The account and everything about the person is deleted once a year has passed since that
--     day (GDPR storage limitation), by a job that runs every night.
--   * A learner removed from every course is deleted a year after the last removal.
--
-- Access is worked out on every query: enrolling the person in a later edition, or moving an
-- edition's last day, opens it again at once. The rule only ever closes access; it never opens
-- anything an enrolment does not. A learner with no dated enrolment keeps access and is not
-- deleted by the job (unless they are removed from every course). Trainers are never affected.
--
-- Access is enforced where the rest of a learner's access is decided: the helpers that say which
-- courses and editions they may open, and the view that says which materials they see.
-- Everything that reads those (the rules on modules, materials, stored files and unlisted
-- courses, progress, quizzes, the trainers' names and messages) follows without change.

-- ---------------------------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------------------------
create function private.site_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Lisbon')::date;
$$;

-- A learner's last training day, or null (a trainer, or no dated enrolment). Answers about
-- anyone: only the definer functions of this file call it.
create function private.last_training_day(target_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(coalesce(ed.ends_on, ed.starts_on, c.starts_on))
  from public.enrollments e
  join public.editions ed on ed.id = e.edition_id
  join public.courses c on c.id = e.course_id
  where e.user_id = target_user
    and not exists (
      select 1 from public.profiles p where p.id = target_user and p.role = 'trainer'
    );
$$;

-- The last day a learner has access, or null when it does not end.
create function private.access_ends_on(target_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (private.last_training_day(target_user) + interval '2 months')::date;
$$;

-- ---------------------------------------------------------------------------------------------
-- When a learner was removed from their last course
-- ---------------------------------------------------------------------------------------------
-- Null while the person is in at least one course. Written only by the triggers below: it is not
-- writable through the API.
alter table public.profiles add column unenrolled_at timestamptz;

create function private.track_unenrolment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles p
    set unenrolled_at = null
    where p.id = new.user_id and p.unenrolled_at is not null;
    return null;
  end if;

  -- (When the profile itself is being deleted, there is no row left to update.)
  update public.profiles p
  set unenrolled_at = now()
  where p.id = old.user_id
    and not exists (select 1 from public.enrollments e where e.user_id = old.user_id);
  return null;
end;
$$;

revoke all on function private.track_unenrolment() from public;

create trigger enrollments_track_unenrolment
  after insert or delete on public.enrollments
  for each row execute function private.track_unenrolment();

-- Learners already in no course: their year starts now.
update public.profiles p
set unenrolled_at = now()
where p.role = 'learner'
  and not exists (select 1 from public.enrollments e where e.user_id = p.id);

-- The last day a learner's data is kept, or null when the job leaves it alone: a year after
-- their last training day, or, when they are in no course, a year after they were removed.
create function private.data_kept_until(target_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce(
      private.last_training_day(target_user),
      (
        select (p.unenrolled_at at time zone 'Europe/Lisbon')::date
        from public.profiles p
        where p.id = target_user and p.role = 'learner'
      )
    ) + interval '1 year'
  )::date;
$$;

create function private.has_open_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.access_ends_on(target_user) >= private.site_today(), true);
$$;

revoke all on function private.site_today() from public;
revoke all on function private.last_training_day(uuid) from public;
revoke all on function private.access_ends_on(uuid) from public;
revoke all on function private.data_kept_until(uuid) from public;
revoke all on function private.has_open_access(uuid) from public;
grant execute on function private.site_today() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Where access applies (same names, arguments and columns as before, so every caller stays)
-- ---------------------------------------------------------------------------------------------
create or replace function private.enrolled_course_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.course_id
  from public.enrollments e
  where e.user_id = (select auth.uid())
    and private.has_open_access(e.user_id);
$$;

create or replace function private.accessible_course_ids()
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
    and c.status in ('published', 'unlisted')
    and private.has_open_access(e.user_id);
$$;

create or replace function private.my_edition_ids()
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
    and c.status in ('published', 'unlisted')
    and private.has_open_access(e.user_id);
$$;

-- What a learner sees: what their edition shows, while the course is not a draft and their
-- access has not ended.
create or replace view private.learner_materials as
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
where c.status in ('published', 'unlisted')
  and private.has_open_access(e.user_id);

revoke all on table private.learner_materials from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Reading it: the person themselves, and trainers
-- ---------------------------------------------------------------------------------------------
-- When the person's access ends, whether it is still open today, and until when their data is
-- kept (null: it does not end). Nothing for anyone but the person and trainers.
create function private.learner_access(target_user uuid)
returns table (ends_on date, is_open boolean, kept_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.access_ends_on(target_user),
    private.has_open_access(target_user),
    private.data_kept_until(target_user)
  where target_user = (select auth.uid()) or (select private.is_trainer());
$$;

revoke all on function private.learner_access(uuid) from public;
grant execute on function private.learner_access(uuid) to authenticated;

create function public.learner_access(target_user uuid)
returns table (ends_on date, is_open boolean, kept_until date)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.learner_access(target_user);
$$;

revoke all on function public.learner_access(uuid) from public, anon;
grant execute on function public.learner_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Deleting what is no longer kept
-- ---------------------------------------------------------------------------------------------
-- Deletes every learner whose data is kept no longer, and answers how many. Deleting the
-- account (auth.users) takes the profile with it, and with the profile the enrolments,
-- progress, quiz attempts and conversations; messages they wrote go with their conversations.
-- The information requests sent from their address go too. No API role may call it: the
-- nightly job does, and a person with database access can.
create function private.purge_expired_learners()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_emails text[];
begin
  select array_agg(p.id), array_agg(lower(p.email))
  into v_ids, v_emails
  from public.profiles p
  where p.role = 'learner'
    and private.data_kept_until(p.id) < private.site_today();

  if v_ids is null then
    return 0;
  end if;

  delete from public.info_requests r where lower(r.email) = any (v_emails);
  delete from auth.users u where u.id = any (v_ids);
  return cardinality(v_ids);
end;
$$;

revoke all on function private.purge_expired_learners() from public;

create extension if not exists pg_cron with schema pg_catalog;

-- Every night at 03:17 UTC. Scheduling under the same name again replaces the job.
select cron.schedule(
  'purge-expired-learners',
  '17 3 * * *',
  $$select private.purge_expired_learners()$$
);
