-- Quizzes: a kind of material made of questions with options. For practice: a learner answers,
-- hands it in, sees at once what was right and why, and may try again as often as they like.
-- Every attempt is kept; trainers see each learner's best score, attempts and last attempt.
--
-- The right answers and the explanations live in a table only trainers can read. A learner
-- sees them inside their own attempts, that is, only after handing one in.

-- A quiz carries no payload of its own; its introduction is the material's description.
alter table public.materials
  drop constraint materials_payload_matches_kind,
  add constraint materials_payload_matches_kind check (
    (kind = 'file'
      and storage_path is not null and file_name is not null
      and url is null and body_pt is null and body_en is null)
    or (kind in ('video', 'embed', 'link')
      and url is not null
      and storage_path is null and file_name is null and body_pt is null and body_en is null)
    or (kind = 'page'
      and coalesce(nullif(btrim(body_pt), ''), nullif(btrim(body_en), '')) is not null
      and url is null and storage_path is null and file_name is null)
    or (kind = 'quiz'
      and url is null and storage_path is null and file_name is null
      and body_pt is null and body_en is null)
  );

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete cascade,
  sort_order integer not null,
  prompt_pt text,
  prompt_en text,
  -- Tells the learner's page whether to offer one choice or several, without the key.
  allows_multiple boolean not null default false,
  constraint quiz_questions_prompt_required check (
    coalesce(nullif(btrim(prompt_pt), ''), nullif(btrim(prompt_en), '')) is not null
  ),
  constraint quiz_questions_order_key unique (material_id, sort_order)
);

create table public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  sort_order integer not null,
  label_pt text,
  label_en text,
  constraint quiz_options_label_required check (
    coalesce(nullif(btrim(label_pt), ''), nullif(btrim(label_en), '')) is not null
  ),
  constraint quiz_options_order_key unique (question_id, sort_order)
);

-- The answer key lives apart, in a table only trainers can read.
create table public.quiz_question_keys (
  question_id uuid primary key references public.quiz_questions (id) on delete cascade,
  correct_option_ids uuid[] not null check (cardinality(correct_option_ids) >= 1),
  explanation_pt text,
  explanation_en text
);

-- One row per submission. `detail` is a full copy of what was asked, chosen and right, so an
-- attempt stays readable and keeps its score whatever happens to the quiz later.
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  edition_id uuid references public.editions (id) on delete set null,
  submitted_at timestamptz not null default now(),
  correct_count integer not null,
  question_count integer not null,
  detail_version smallint not null default 1,
  detail jsonb not null,
  constraint quiz_attempts_counts check (
    question_count > 0 and correct_count between 0 and question_count
  )
);

create index quiz_attempts_user_material_idx
  on public.quiz_attempts (user_id, material_id, submitted_at desc);
create index quiz_attempts_material_idx on public.quiz_attempts (material_id);
create index quiz_attempts_edition_idx on public.quiz_attempts (edition_id);

-- Same columns as before, one more rule: a quiz with no questions is not shown, so it can
-- never stand between a learner and 100%.
create or replace view private.edition_materials as
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
  )
  and (mt.kind <> 'quiz'
    or exists (select 1 from public.quiz_questions qq where qq.material_id = mt.id));

alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_question_keys enable row level security;
alter table public.quiz_attempts enable row level security;

revoke all on table public.quiz_questions, public.quiz_options, public.quiz_question_keys,
  public.quiz_attempts from anon, authenticated, service_role;
-- Read only for API users: quizzes are written by save_quiz, attempts by submit_quiz.
grant select on table public.quiz_questions, public.quiz_options, public.quiz_question_keys,
  public.quiz_attempts to authenticated;
grant select, insert, update, delete on table public.quiz_questions, public.quiz_options,
  public.quiz_question_keys, public.quiz_attempts to service_role;

create policy quiz_questions_read on public.quiz_questions for select to authenticated
  using (
    (select private.is_trainer())
    or material_id in (select private.visible_material_ids())
  );
-- An option is readable when its question is (the inner query runs under the policy above).
create policy quiz_options_read on public.quiz_options for select to authenticated
  using (
    (select private.is_trainer())
    or question_id in (select q.id from public.quiz_questions q)
  );
create policy quiz_question_keys_read on public.quiz_question_keys for select to authenticated
  using ((select private.is_trainer()));
create policy quiz_attempts_read on public.quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_trainer()));

-- Replaces all questions of a quiz in one go. `questions` is a list of
--   { prompt_pt, prompt_en, explanation_pt, explanation_en, multiple,
--     options: [ { label_pt, label_en, correct } ] }
create function private.save_quiz(target_material_id uuid, questions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question jsonb;
  v_option jsonb;
  v_question_no integer;
  v_option_no integer;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_count integer;
  v_correct uuid[];
  v_saved integer := 0;
begin
  if not (select private.is_trainer()) then
    raise exception 'only trainers can edit quizzes' using errcode = '42501';
  end if;

  -- The lock keeps two saves, or a save and a submission, from interleaving.
  perform 1 from public.materials mt
  where mt.id = target_material_id and mt.kind = 'quiz'
  for update of mt;
  if not found then
    raise exception 'quiz not found' using errcode = 'P0002';
  end if;

  if questions is null or jsonb_typeof(questions) <> 'array' then
    raise exception 'questions must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(questions) = 0 then
    raise exception 'a quiz needs at least one question' using errcode = '23514';
  end if;

  -- Options and keys go with their questions. Every question gets a new id, which is how a form
  -- opened before this save is recognised as out of date.
  delete from public.quiz_questions q where q.material_id = target_material_id;

  for v_question, v_question_no in
    select t.elem, t.ord
    from jsonb_array_elements(questions) with ordinality as t (elem, ord)
    order by t.ord
  loop
    if jsonb_typeof(v_question) <> 'object'
       or jsonb_typeof(v_question -> 'options') is distinct from 'array' then
      raise exception 'question % is not well formed', v_question_no using errcode = '22023';
    end if;
    if jsonb_array_length(v_question -> 'options') < 2 then
      raise exception 'question % needs at least two options', v_question_no
        using errcode = '23514';
    end if;

    select count(*) filter (where (o.elem -> 'correct') = 'true'::jsonb)
    into v_correct_count
    from jsonb_array_elements(v_question -> 'options') as o (elem);
    if v_correct_count = 0 then
      raise exception 'question % needs at least one correct option', v_question_no
        using errcode = '23514';
    end if;

    insert into public.quiz_questions
      (material_id, sort_order, prompt_pt, prompt_en, allows_multiple)
    values (
      target_material_id,
      v_question_no,
      nullif(btrim(v_question ->> 'prompt_pt'), ''),
      nullif(btrim(v_question ->> 'prompt_en'), ''),
      v_correct_count > 1 or coalesce((v_question -> 'multiple') = 'true'::jsonb, false)
    )
    returning id into v_question_id;

    v_correct := '{}'::uuid[];
    for v_option, v_option_no in
      select t.elem, t.ord
      from jsonb_array_elements(v_question -> 'options') with ordinality as t (elem, ord)
      order by t.ord
    loop
      insert into public.quiz_options (question_id, sort_order, label_pt, label_en)
      values (
        v_question_id,
        v_option_no,
        nullif(btrim(v_option ->> 'label_pt'), ''),
        nullif(btrim(v_option ->> 'label_en'), '')
      )
      returning id into v_option_id;

      if (v_option -> 'correct') = 'true'::jsonb then
        v_correct := array_append(v_correct, v_option_id);
      end if;
    end loop;

    insert into public.quiz_question_keys
      (question_id, correct_option_ids, explanation_pt, explanation_en)
    values (
      v_question_id,
      v_correct,
      nullif(btrim(v_question ->> 'explanation_pt'), ''),
      nullif(btrim(v_question ->> 'explanation_en'), '')
    );

    v_saved := v_saved + 1;
  end loop;

  return v_saved;
end;
$$;

-- Grades a whole quiz. `answers` maps every question id to the list of chosen option ids:
--   { "<question id>": ["<option id>", ...], ... }
-- Returns { attempt_id, correct_count, question_count, detail }. A trainer gets the result
-- with attempt_id null: nothing is stored for them.
create function private.submit_quiz(target_material_id uuid, answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_trainer boolean := (select private.is_trainer());
  v_edition uuid;
  v_total integer;
  v_right integer;
  v_detail jsonb;
  v_attempt_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- The same rule as reading. One answer for "does not exist" and "not yours".
  if v_trainer then
    perform 1 from public.materials mt
    where mt.id = target_material_id and mt.kind = 'quiz';
  else
    select lm.edition_id into v_edition
    from private.learner_materials lm
    where lm.user_id = v_user
      and lm.material_id = target_material_id
      and lm.kind = 'quiz';
  end if;
  if not found then
    raise exception 'quiz not found' using errcode = 'P0002';
  end if;

  -- Waits for a save in progress; a save waits for this submission.
  perform 1 from public.materials mt where mt.id = target_material_id for key share of mt;

  if answers is null or jsonb_typeof(answers) <> 'object' then
    raise exception 'answers must map each question to its chosen options'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(answers) as a (question_key, chosen)
    where jsonb_typeof(a.chosen) <> 'array'
  ) then
    raise exception 'answers must map each question to its chosen options'
      using errcode = '22023';
  end if;

  -- Exactly the questions of the quiz as it is now, no more and no fewer.
  if (select array_agg(q.id::text order by q.id::text)
      from public.quiz_questions q
      where q.material_id = target_material_id)
     is distinct from
     (select array_agg(k.question_key order by k.question_key)
      from jsonb_object_keys(answers) as k (question_key)) then
    raise exception 'the quiz has changed since it was opened'
      using errcode = 'P0001', hint = 'quiz_changed';
  end if;

  select
    count(*)::integer,
    (count(*) filter (where g.is_right))::integer,
    jsonb_agg(
      jsonb_build_object(
        'question_id', g.id,
        'prompt_pt', g.prompt_pt,
        'prompt_en', g.prompt_en,
        'allows_multiple', g.allows_multiple,
        'is_correct', g.is_right,
        'explanation_pt', g.explanation_pt,
        'explanation_en', g.explanation_en,
        'options', g.options
      )
      order by g.sort_order
    )
  into v_total, v_right, v_detail
  from (
    select
      q.id, q.sort_order, q.prompt_pt, q.prompt_en, q.allows_multiple,
      k.explanation_pt, k.explanation_en,
      -- Full credit only when the chosen set is exactly the correct set.
      (c.chosen @> k.correct_option_ids and c.chosen <@ k.correct_option_ids) as is_right,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'label_pt', o.label_pt,
            'label_en', o.label_en,
            'chosen', o.id = any (c.chosen),
            'correct', o.id = any (k.correct_option_ids)
          )
          order by o.sort_order
        )
        from public.quiz_options o
        where o.question_id = q.id
      ) as options
    from public.quiz_questions q
    join public.quiz_question_keys k on k.question_id = q.id
    cross join lateral (
      select coalesce(array_agg(distinct x.option_id::uuid), '{}'::uuid[]) as chosen
      from jsonb_array_elements_text(answers -> (q.id::text)) as x (option_id)
    ) c
    where q.material_id = target_material_id
  ) g;

  if v_total = 0 then
    raise exception 'this quiz has no questions yet' using errcode = 'P0002';
  end if;

  if not v_trainer then
    insert into public.quiz_attempts
      (user_id, material_id, edition_id, correct_count, question_count, detail)
    values (v_user, target_material_id, v_edition, v_right, v_total, v_detail)
    returning id into v_attempt_id;

    -- A submitted attempt is what makes a quiz count as done.
    insert into public.material_progress as p (user_id, material_id, completed_at)
    values (v_user, target_material_id, now())
    on conflict (user_id, material_id) do update
      set completed_at = coalesce(p.completed_at, excluded.completed_at),
          last_opened_at = excluded.last_opened_at;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'correct_count', v_right,
    'question_count', v_total,
    'detail', v_detail
  );
end;
$$;

revoke all on function private.save_quiz(uuid, jsonb) from public;
revoke all on function private.submit_quiz(uuid, jsonb) from public;
grant execute on function private.save_quiz(uuid, jsonb) to authenticated;
grant execute on function private.submit_quiz(uuid, jsonb) to authenticated;

create function public.save_quiz(target_material_id uuid, questions jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.save_quiz(target_material_id, questions);
$$;

create function public.submit_quiz(target_material_id uuid, answers jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_quiz(target_material_id, answers);
$$;

revoke all on function public.save_quiz(uuid, jsonb) from public, anon;
revoke all on function public.submit_quiz(uuid, jsonb) from public, anon;
grant execute on function public.save_quiz(uuid, jsonb) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;

-- Best score, number of attempts and last attempt per learner and quiz. Runs as the caller:
-- a trainer gets everyone, a learner only themselves. Scores are fractions from 0 to 1.
create view public.quiz_results
with (security_invoker = true)
as
select
  a.material_id,
  a.user_id,
  count(*)::integer as attempt_count,
  round(max(a.correct_count::numeric / a.question_count), 4) as best_score,
  round((array_agg(a.correct_count::numeric / a.question_count
                   order by a.submitted_at desc, a.id desc))[1], 4) as last_score,
  max(a.submitted_at) as last_submitted_at
from public.quiz_attempts a
group by a.material_id, a.user_id;

revoke all on table public.quiz_results from anon, authenticated, service_role;
grant select on table public.quiz_results to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Progress: a quiz is done when it is handed in, not when it is opened
-- ---------------------------------------------------------------------------------------------
create or replace function private.record_material_open(target_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_kind public.material_kind;
begin
  if v_user is null or (select private.is_trainer()) then
    return false;
  end if;

  select lm.kind into v_kind
  from private.learner_materials lm
  where lm.user_id = v_user and lm.material_id = target_material_id;
  if not found then
    return false;
  end if;

  insert into public.material_progress as p (user_id, material_id, completed_at)
  values (v_user, target_material_id, case when v_kind = 'quiz' then null else now() end)
  on conflict (user_id, material_id) do update
    set last_opened_at = excluded.last_opened_at
    -- Reloading a page within a minute writes nothing.
    where p.last_opened_at < excluded.last_opened_at - interval '1 minute';
  return true;
end;
$$;
