-- Keep the auth user's metadata in step with the profile.
--
-- The email templates choose their language from the auth user's metadata (`.Data.locale`),
-- while the app, learners and trainers change name and language on the profile. This trigger
-- copies those two fields across whenever they change, whichever path the change takes, so a
-- password-reset email is always written in the language the person last chose.
--
-- It gives users nothing new: they may already edit their own name and language, and these
-- two metadata fields are never used for access decisions.
create function private.sync_profile_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users u
  set raw_user_meta_data =
    coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('locale', new.locale, 'full_name', new.full_name)
  where u.id = new.id;
  return null;
end;
$$;

revoke all on function private.sync_profile_to_auth() from public;

create trigger profiles_sync_to_auth
  after update of locale, full_name on public.profiles
  for each row
  when (old.locale is distinct from new.locale or old.full_name is distinct from new.full_name)
  execute function private.sync_profile_to_auth();
