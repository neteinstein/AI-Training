-- Courses: when and where each one takes place, shown on the course cards.
--
-- The course form requires both. The columns stay nullable so that courses created before
-- they existed keep working (status changes included) until a trainer fills them in.
alter table public.courses
  add column starts_on date,
  add column location text check (location is null or btrim(location) <> '');
