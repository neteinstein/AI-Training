-- Storage: a private bucket for uploaded course files, its access rules, and a cleanup outbox.

-- ---------------------------------------------------------------------------------------------
-- Bucket. Object keys are `{course_id}/{uuid}.{ext}`; the original filename (accents and all)
-- lives in materials.file_name, because object keys only accept a limited character set.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials',
  'course-materials',
  false,
  52428800, -- 50 MiB, the ceiling on Supabase's Free plan
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain',
    'text/csv',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/zip',
    'audio/mpeg',
    'video/mp4'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------
-- Who may read a stored object: a learner only when it belongs to a published file material
-- in a course they may open.
-- ---------------------------------------------------------------------------------------------
create function private.can_read_material_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materials mt
    where mt.storage_path = object_name
      and mt.kind = 'file'
      and mt.is_published
      and mt.module_id in (select private.accessible_module_ids())
  );
$$;

revoke all on function private.can_read_material_object(text) from public;
grant execute on function private.can_read_material_object(text) to authenticated, service_role;

create policy course_materials_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-materials'
    and ((select private.is_trainer()) or private.can_read_material_object(name))
  );

create policy course_materials_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-materials' and (select private.is_trainer()));

create policy course_materials_update on storage.objects
  for update to authenticated
  using (bucket_id = 'course-materials' and (select private.is_trainer()))
  with check (bucket_id = 'course-materials' and (select private.is_trainer()));

create policy course_materials_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-materials' and (select private.is_trainer()));

-- ---------------------------------------------------------------------------------------------
-- Cleanup outbox. Deleting a row in SQL does not delete the stored file, and files can
-- disappear from the database through cascades (a module or course being deleted). A trigger
-- records every orphaned object here; the app removes them through the Storage API and then
-- deletes the outbox rows.
-- ---------------------------------------------------------------------------------------------
create table public.storage_deletions (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  created_at timestamptz not null default now()
);

alter table public.storage_deletions enable row level security;

revoke all on table public.storage_deletions from anon, authenticated, service_role;
grant select, delete on table public.storage_deletions to authenticated;
grant select, insert, delete on table public.storage_deletions to service_role;

create policy storage_deletions_read on public.storage_deletions
  for select to authenticated
  using ((select private.is_trainer()));

create policy storage_deletions_delete on public.storage_deletions
  for delete to authenticated
  using ((select private.is_trainer()));

create function private.enqueue_storage_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.storage_path is not null
     and (tg_op = 'DELETE' or new.storage_path is distinct from old.storage_path) then
    insert into public.storage_deletions (bucket_id, object_path)
    values ('course-materials', old.storage_path);
  end if;
  return null;
end;
$$;

create trigger materials_enqueue_storage_deletion
  after delete or update of storage_path on public.materials
  for each row execute function private.enqueue_storage_deletion();
