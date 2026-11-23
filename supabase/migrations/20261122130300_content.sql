-- Course content: modules (ordered sections) and materials.
--
-- Bilingual rule for content: at least one language is required; the interface falls back to
-- the other one. Trainers are not forced to translate every material.

-- ---------------------------------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------------------------------
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title_pt text,
  title_en text,
  description_pt text,
  description_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_title_required check (
    coalesce(nullif(btrim(title_pt), ''), nullif(btrim(title_en), '')) is not null
  )
);

create index modules_course_idx on public.modules (course_id, sort_order);

create trigger modules_set_updated_at
  before update on public.modules
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Materials
--   file:  stored in the private bucket `course-materials`
--   video: YouTube or Vimeo address, embedded
--   embed: Google Docs / Slides / Sheets / Drive address, embedded
--   link:  any external address, opened in a new tab
--   page:  Markdown written in the back-office
-- ---------------------------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  kind public.material_kind not null,
  title_pt text,
  title_en text,
  description_pt text,
  description_en text,
  -- Language of the resource itself (a PDF, a video), shown as a tag. Optional.
  content_language text check (content_language in ('pt', 'en')),
  -- Learners only ever see published materials.
  is_published boolean not null default false,
  url text,
  body_pt text, -- Markdown
  body_en text, -- Markdown
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_title_required check (
    coalesce(nullif(btrim(title_pt), ''), nullif(btrim(title_en), '')) is not null
  ),
  constraint materials_payload_matches_kind check (
    (kind = 'file'
      and storage_path is not null and file_name is not null
      and url is null and body_pt is null and body_en is null)
    or (kind in ('video', 'embed', 'link')
      and url is not null
      and storage_path is null and file_name is null and body_pt is null and body_en is null)
    or (kind = 'page'
      and coalesce(nullif(btrim(body_pt), ''), nullif(btrim(body_en), '')) is not null
      and url is null and storage_path is null and file_name is null)
  ),
  constraint materials_url_scheme check (url is null or url ~ '^https?://[^[:space:]]+$'),
  -- Frames are only ever built for these hosts. The app parses the address again and rebuilds
  -- the frame address from the video or document id; this is the database's own backstop.
  constraint materials_video_host check (
    kind <> 'video'
    or url ~* '^https://((www\.|m\.)?youtube\.com|youtu\.be|www\.youtube-nocookie\.com|(www\.|player\.)?vimeo\.com)/'
  ),
  constraint materials_embed_host check (
    kind <> 'embed'
    or url ~* '^https://(docs|drive)\.google\.com/'
  )
);

create index materials_module_idx on public.materials (module_id, sort_order);
create unique index materials_storage_path_key
  on public.materials (storage_path)
  where storage_path is not null;

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Helper for policies: modules of the courses the current user may open.
-- ---------------------------------------------------------------------------------------------
create function private.accessible_module_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  join public.modules m on m.course_id = c.id
  where e.user_id = (select auth.uid())
    and c.status in ('published', 'unlisted');
$$;

revoke all on function private.accessible_module_ids() from public;
grant execute on function private.accessible_module_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Privileges and policies. Visitors get nothing here: content is for enrolled learners.
-- ---------------------------------------------------------------------------------------------
alter table public.modules enable row level security;
alter table public.materials enable row level security;

revoke all on table public.modules, public.materials from anon, authenticated, service_role;
grant select, insert, update, delete on table public.modules, public.materials
  to authenticated, service_role;

create policy modules_read on public.modules for select to authenticated
  using (
    (select private.is_trainer())
    or course_id in (select private.accessible_course_ids())
  );
create policy modules_insert on public.modules for insert to authenticated
  with check ((select private.is_trainer()));
create policy modules_update on public.modules for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy modules_delete on public.modules for delete to authenticated
  using ((select private.is_trainer()));

create policy materials_read on public.materials for select to authenticated
  using (
    (select private.is_trainer())
    or (is_published and module_id in (select private.accessible_module_ids()))
  );
create policy materials_insert on public.materials for insert to authenticated
  with check ((select private.is_trainer()));
create policy materials_update on public.materials for update to authenticated
  using ((select private.is_trainer())) with check ((select private.is_trainer()));
create policy materials_delete on public.materials for delete to authenticated
  using ((select private.is_trainer()));

-- ---------------------------------------------------------------------------------------------
-- Ordering (run as the caller, so the policies above apply)
-- ---------------------------------------------------------------------------------------------
create function public.reorder_modules(target_course_id uuid, ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.modules m
  set sort_order = (t.position * 10)::integer
  from unnest(ordered_ids) with ordinality as t (id, position)
  where m.id = t.id
    and m.course_id = target_course_id;
$$;

create function public.reorder_materials(target_module_id uuid, ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.materials mt
  set sort_order = (t.position * 10)::integer
  from unnest(ordered_ids) with ordinality as t (id, position)
  where mt.id = t.id
    and mt.module_id = target_module_id;
$$;

revoke all on function public.reorder_modules(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_materials(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_modules(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_materials(uuid, uuid[]) to authenticated;
