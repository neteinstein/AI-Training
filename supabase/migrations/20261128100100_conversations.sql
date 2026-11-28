-- Conversations: what a learner asks the trainers of a course, and what they answer.
--
-- One conversation per learner and course. The trainers share it: any of them may answer, and
-- the learner sees who did. It is not a live chat: a message waits until it is read, and what
-- is waiting is kept on the conversation itself, in two marks.
--
--   unanswered_since  the learner wrote, and no trainer has answered or set it aside since
--   unread_since      a trainer wrote, and the learner has not opened the conversation since
--
-- Nobody writes these tables through the API. The functions below do, each after checking who
-- is calling, so the marks always agree with the messages. (They are plain functions, not
-- triggers, so that a backup's rows can be put back exactly as they were.)

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  learner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unanswered_since timestamptz,
  unread_since timestamptz,
  constraint conversations_course_learner_key unique (course_id, learner_id)
);

create index conversations_learner_idx on public.conversations (learner_id);
create index conversations_unanswered_idx on public.conversations (unanswered_since)
  where unanswered_since is not null;

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Empty once the account of a trainer who answered is removed; the answer stays. (A
  -- learner's conversations go with their account.)
  author_id uuid references public.profiles (id) on delete set null,
  -- Which side wrote it. Kept apart from the author, whose role or account may change later.
  from_trainer boolean not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint conversation_messages_body_length check (
    btrim(body, E' \t\n\r') <> '' and char_length(body) <= 4000
  )
);

create index conversation_messages_conversation_idx
  on public.conversation_messages (conversation_id, created_at);
create index conversation_messages_author_idx on public.conversation_messages (author_id);

-- ---------------------------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

revoke all on table public.conversations, public.conversation_messages
  from anon, authenticated, service_role;
-- Read only for API users, but for one thing: a trainer may delete a whole conversation.
grant select, delete on table public.conversations to authenticated;
grant select on table public.conversation_messages to authenticated;
grant select, insert, update, delete on table public.conversations, public.conversation_messages
  to service_role;

-- A learner reads their own conversations; trainers read everyone's.
create policy conversations_read on public.conversations for select to authenticated
  using (learner_id = (select auth.uid()) or (select private.is_trainer()));
create policy conversations_delete on public.conversations for delete to authenticated
  using ((select private.is_trainer()));
-- A message is readable when its conversation is (the inner query runs under the policy above).
create policy conversation_messages_read on public.conversation_messages
  for select to authenticated
  using (
    (select private.is_trainer())
    or conversation_id in (select c.id from public.conversations c)
  );

-- ---------------------------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------------------------
-- A learner writes to the trainers of a course they may open. The first message starts the
-- conversation. Answers the id of the message.
create function private.send_course_message(target_course_id uuid, message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_body text := btrim(coalesce(message, ''), E' \t\n\r');
  v_now timestamptz := clock_timestamp();
  v_conversation uuid;
  v_message uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- Trainers open courses to check them, not to follow them: they answer, they do not ask.
  if (select private.is_trainer()) then
    raise exception 'trainers answer conversations, they do not start them'
      using errcode = '42501';
  end if;
  -- The same rule as opening the course. One answer for "does not exist" and "not yours".
  if target_course_id is null
     or target_course_id not in (select private.accessible_course_ids()) then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  if v_body = '' or char_length(v_body) > 4000 then
    raise exception 'a message has between 1 and 4000 characters' using errcode = '23514';
  end if;

  insert into public.conversations as c
    (course_id, learner_id, created_at, last_message_at, unanswered_since)
  values (target_course_id, v_user, v_now, v_now, v_now)
  on conflict (course_id, learner_id) do update
    set last_message_at = excluded.last_message_at,
        -- Waiting since the first message nobody answered, not since the latest.
        unanswered_since = coalesce(c.unanswered_since, excluded.unanswered_since),
        -- Whoever writes has seen what was there.
        unread_since = null
  returning c.id into v_conversation;

  insert into public.conversation_messages
    (conversation_id, author_id, from_trainer, body, created_at)
  values (v_conversation, v_user, false, v_body, v_now)
  returning id into v_message;

  return v_message;
end;
$$;

-- A trainer answers. Answers the id of the message.
create function private.answer_conversation(target_conversation_id uuid, message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_body text := btrim(coalesce(message, ''), E' \t\n\r');
  v_now timestamptz := clock_timestamp();
  v_message uuid;
begin
  if v_user is null or not (select private.is_trainer()) then
    raise exception 'only trainers answer conversations' using errcode = '42501';
  end if;
  if v_body = '' or char_length(v_body) > 4000 then
    raise exception 'a message has between 1 and 4000 characters' using errcode = '23514';
  end if;

  -- Updated first: the row is then held until the message is in, so two messages written at
  -- the same moment go in one after the other.
  update public.conversations c
  set last_message_at = v_now,
      unanswered_since = null,
      -- Unread since the first answer the learner has not seen, not since the latest.
      unread_since = coalesce(c.unread_since, v_now)
  where c.id = target_conversation_id;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  insert into public.conversation_messages
    (conversation_id, author_id, from_trainer, body, created_at)
  values (target_conversation_id, v_user, true, v_body, v_now)
  returning id into v_message;

  return v_message;
end;
$$;

-- The learner has opened their conversation: nothing in it is new to them any more. True when
-- there was something new.
create function private.mark_conversation_read(target_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set unread_since = null
  where c.id = target_conversation_id
    and c.learner_id = (select auth.uid())
    and c.unread_since is not null;
  return found;
end;
$$;

-- A trainer sets a conversation aside: its last message needs no answer ("thank you").
-- True when it was waiting for one.
create function private.mark_conversation_answered(target_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_trainer()) then
    raise exception 'only trainers set conversations aside' using errcode = '42501';
  end if;
  update public.conversations c
  set unanswered_since = null
  where c.id = target_conversation_id
    and c.unanswered_since is not null;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------------------------
-- The messages of a conversation, oldest first, each with the name of who wrote it. For the
-- learner whose conversation it is, and for trainers. A learner cannot read anyone else's
-- profile, so this is how the name of the trainer who answered reaches them, and only the name.
create function private.conversation_thread(target_conversation_id uuid)
returns table (
  id uuid,
  from_trainer boolean,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.from_trainer, m.author_id, coalesce(p.full_name, ''), m.body, m.created_at
  from public.conversations c
  join public.conversation_messages m on m.conversation_id = c.id
  left join public.profiles p on p.id = m.author_id
  where c.id = target_conversation_id
    and (c.learner_id = (select auth.uid()) or (select private.is_trainer()))
  order by m.created_at, m.id;
$$;

revoke all on function private.send_course_message(uuid, text) from public;
revoke all on function private.answer_conversation(uuid, text) from public;
revoke all on function private.mark_conversation_read(uuid) from public;
revoke all on function private.mark_conversation_answered(uuid) from public;
revoke all on function private.conversation_thread(uuid) from public;
grant execute on function private.send_course_message(uuid, text) to authenticated;
grant execute on function private.answer_conversation(uuid, text) to authenticated;
grant execute on function private.mark_conversation_read(uuid) to authenticated;
grant execute on function private.mark_conversation_answered(uuid) to authenticated;
grant execute on function private.conversation_thread(uuid) to authenticated;

-- Thin wrappers, so the definer functions stay out of the API-exposed schema.
create function public.send_course_message(target_course_id uuid, message text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.send_course_message(target_course_id, message);
$$;

create function public.answer_conversation(target_conversation_id uuid, message text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.answer_conversation(target_conversation_id, message);
$$;

create function public.mark_conversation_read(target_conversation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.mark_conversation_read(target_conversation_id);
$$;

create function public.mark_conversation_answered(target_conversation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.mark_conversation_answered(target_conversation_id);
$$;

create function public.conversation_thread(target_conversation_id uuid)
returns table (
  id uuid,
  from_trainer boolean,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.conversation_thread(target_conversation_id);
$$;

revoke all on function public.send_course_message(uuid, text) from public, anon;
revoke all on function public.answer_conversation(uuid, text) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.mark_conversation_answered(uuid) from public, anon;
revoke all on function public.conversation_thread(uuid) from public, anon;
grant execute on function public.send_course_message(uuid, text) to authenticated;
grant execute on function public.answer_conversation(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_conversation_answered(uuid) to authenticated;
grant execute on function public.conversation_thread(uuid) to authenticated;
