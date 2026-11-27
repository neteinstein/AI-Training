-- A new kind of material: a quiz.
--
-- This must stay alone in its file. A new value of an enum cannot be used (in a check, a view,
-- a function or a row) until the transaction that added it has ended, and each migration file
-- is one transaction. Everything that says 'quiz' is in the next file.
alter type public.material_kind add value if not exists 'quiz';
