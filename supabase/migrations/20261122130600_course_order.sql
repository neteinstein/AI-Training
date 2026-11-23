-- Courses: the order they appear in, and the date each one first went public.

-- Ordering (runs as the caller, so the course policies apply).
create function public.reorder_courses(ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.courses c
  set sort_order = (t.position * 10)::integer
  from unnest(ordered_ids) with ordinality as t (id, position)
  where c.id = t.id;
$$;

revoke all on function public.reorder_courses(uuid[]) from public, anon;
grant execute on function public.reorder_courses(uuid[]) to authenticated;

-- `published_at` records the first publication and is never cleared, so a course that is
-- unlisted and published again keeps its original date.
create function private.stamp_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger courses_stamp_published_at
  before insert or update of status on public.courses
  for each row execute function private.stamp_published_at();

update public.courses
set published_at = created_at
where status = 'published' and published_at is null;
