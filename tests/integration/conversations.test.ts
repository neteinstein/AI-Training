import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  answerConversation,
  deleteConversation,
  markConversationAnswered,
  markConversationRead,
  sendCourseMessage,
} from "@/features/conversations/operations";
import { createCourse, setCourseTrainers } from "@/features/courses/operations";
import { unenrollUser } from "@/features/enrollments/operations";
import {
  countConversationsToAnswer,
  fetchConversations,
  fetchCourseTrainerNames,
  fetchCoursesWithNewAnswers,
  fetchMyConversation,
  fetchThread,
  fetchTrainerConversation,
  THREAD_LIMIT,
} from "@/lib/dal/conversation-queries";
import { fetchTrainerCourses, fetchTrainerOptions } from "@/lib/dal/trainer-queries";
import {
  admin,
  createCatalogue,
  createUser,
  deleteCatalogue,
  deleteUsers,
  enroll,
  ensureKeeperTrainer,
  runId,
  visitor,
  type Catalogue,
  type TestUser,
} from "./helpers";

/**
 * Who teaches a course, and the conversations between its learners and its trainers.
 *
 *   Rita teaches the published course. Tomás is a trainer too, and teaches nothing.
 *   Nobody teaches the other published course.
 *   Ana is in both courses (and in the draft one, which learners cannot open); Bea is in the
 *   published course; the outsider is in none.
 */

let catalogue: Catalogue;
let rita: TestUser;
let tomas: TestUser;
let ana: TestUser;
let bea: TestUser;
let outsider: TestUser;
/** A trainer whose account is removed half-way, to see what becomes of their answers. */
let leaving: TestUser | undefined;

let published: string;
let other: string;
let draft: string;

async function conversationOf(learner: TestUser, courseId: string) {
  const { data } = await admin()
    .from("conversations")
    .select("*")
    .eq("course_id", courseId)
    .eq("learner_id", learner.id)
    .maybeSingle();
  return data;
}

async function messagesOf(conversationId: string) {
  const { data } = await admin()
    .from("conversation_messages")
    .select("author_id, from_trainer, body")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return data ?? [];
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  ({ published, other, draft } = catalogue.courses);
  rita = await createUser("trainer", "cv-rita");
  tomas = await createUser("trainer", "cv-tomas");
  ana = await createUser("learner", "cv-ana");
  bea = await createUser("learner", "cv-bea");
  outsider = await createUser("learner", "cv-outsider");
  await enroll(ana.id, [published, other, draft]);
  await enroll(bea.id, [published]);
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await deleteUsers([rita, tomas, ana, bea, outsider, leaving]);
});

describe("the trainers of a course", () => {
  test("a trainer chooses them; the list is made exactly the people given", async () => {
    expect(await setCourseTrainers(rita.client, published, [rita.id, tomas.id])).toBe(true);
    const read = async () =>
      (
        (await admin().from("course_trainers").select("user_id").eq("course_id", published)).data ??
        []
      )
        .map((row) => row.user_id)
        .sort();
    expect(await read()).toEqual([rita.id, tomas.id].sort());

    // Saving again changes nothing; leaving someone out removes them.
    expect(await setCourseTrainers(tomas.client, published, [rita.id, tomas.id])).toBe(true);
    expect(await setCourseTrainers(rita.client, published, [rita.id])).toBe(true);
    expect(await read()).toEqual([rita.id]);
  });

  test("only trainers can teach: a learner in the list is left out", async () => {
    expect(await setCourseTrainers(rita.client, other, [ana.id, "not-an-id"])).toBe(true);
    const { data } = await admin().from("course_trainers").select("user_id").eq("course_id", other);
    expect(data).toEqual([]);
  });

  test("a learner and a visitor can neither read nor change who teaches", async () => {
    expect(await setCourseTrainers(ana.client, other, [rita.id])).toBe(false);
    expect(await setCourseTrainers(rita.client, randomUUID(), [rita.id])).toBe(false);
    expect(await setCourseTrainers(rita.client, "not-an-id", [rita.id])).toBe(false);

    const asLearner = await ana.client.from("course_trainers").select("user_id");
    expect(asLearner.data).toEqual([]);
    const removed = await ana.client
      .from("course_trainers")
      .delete()
      .eq("course_id", published)
      .select("user_id");
    expect(removed.data).toEqual([]);
    const asVisitor = await visitor().from("course_trainers").select("user_id");
    expect(asVisitor.error).not.toBeNull();
    const { data } = await admin().from("course_trainers").select("user_id").eq("course_id", other);
    expect(data).toEqual([]);
  });

  test("whoever creates a course teaches it", async () => {
    const created = await createCourse(
      rita.client,
      {
        slug: `course-taught-${runId}`,
        areaId: catalogue.areaId,
        levelId: catalogue.levelId,
        title: { pt: "Curso com formador", en: "Course with a trainer" },
        summary: { pt: "", en: "" },
        description: { pt: "", en: "" },
        durationHours: null,
        startsOn: "2027-02-13",
        location: "Lisboa",
      },
      rita.id,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    try {
      const { data } = await admin()
        .from("course_trainers")
        .select("user_id")
        .eq("course_id", created.id);
      expect(data).toEqual([{ user_id: rita.id }]);
    } finally {
      await admin().from("courses").delete().eq("id", created.id);
    }
  });

  test("their names reach the course's learners, and nobody else", async () => {
    const names = [{ id: rita.id, name: "cv-rita" }];
    expect(await fetchCourseTrainerNames(ana.client, published)).toEqual(names);
    expect(await fetchCourseTrainerNames(tomas.client, published)).toEqual(names);
    // Not in the course; in it, but it is a draft; a course nobody teaches.
    expect(await fetchCourseTrainerNames(outsider.client, published)).toEqual([]);
    await setCourseTrainers(rita.client, draft, [rita.id]);
    expect(await fetchCourseTrainerNames(ana.client, draft)).toEqual([]);
    expect(await fetchCourseTrainerNames(rita.client, draft)).toEqual(names);
    expect(await fetchCourseTrainerNames(ana.client, other)).toEqual([]);
    expect(await fetchCourseTrainerNames(ana.client, "not-an-id")).toEqual([]);

    const asVisitor = await visitor().rpc("course_trainer_names", { target_course_id: published });
    expect(asVisitor.error).not.toBeNull();
    // A learner still cannot read a trainer's profile: the name is all they get.
    const profile = await ana.client.from("profiles").select("email").eq("id", rita.id);
    expect(profile.data).toEqual([]);
  });

  test("a row only counts while its person is a trainer", async () => {
    await setCourseTrainers(rita.client, published, [rita.id, tomas.id]);
    const names = async () =>
      (await fetchCourseTrainerNames(ana.client, published)).map((trainer) => trainer.name);
    expect(await names()).toEqual(["cv-rita", "cv-tomas"]);
    try {
      await admin().from("profiles").update({ role: "learner" }).eq("id", tomas.id);
      expect(await names()).toEqual(["cv-rita"]);
      const course = (await fetchTrainerCourses(rita.client, "pt")).find(
        (row) => row.id === published,
      );
      expect(course?.trainers).toEqual(["cv-rita"]);
      expect(
        (await fetchTrainerOptions(rita.client, published)).some(
          (option) => option.id === tomas.id,
        ),
      ).toBe(false);
    } finally {
      await admin().from("profiles").update({ role: "trainer" }).eq("id", tomas.id);
    }
    // Nothing was deleted, so nothing has to be put back.
    expect(await names()).toEqual(["cv-rita", "cv-tomas"]);
    expect(await setCourseTrainers(rita.client, published, [rita.id])).toBe(true);
  });

  test("the back-office lists every trainer, saying who teaches the course", async () => {
    const options = await fetchTrainerOptions(rita.client, published);
    const ours = options.filter((option) => [rita.id, tomas.id].includes(option.id));
    expect(ours).toEqual([
      expect.objectContaining({ id: rita.id, fullName: "cv-rita", teaches: true }),
      expect.objectContaining({ id: tomas.id, fullName: "cv-tomas", teaches: false }),
    ]);
    expect(options.some((option) => option.id === ana.id)).toBe(false);
    // For a course that does not exist yet, nobody teaches.
    expect((await fetchTrainerOptions(rita.client)).every((option) => !option.teaches)).toBe(true);

    const courses = await fetchTrainerCourses(rita.client, "pt");
    expect(courses.find((course) => course.id === published)?.trainers).toEqual(["cv-rita"]);
    expect(courses.find((course) => course.id === other)?.trainers).toEqual([]);
  });
});

describe("a conversation between a learner and the trainers of a course", () => {
  let toAnswer: { rita: number; tomas: number };

  test("a learner's first message starts it, and it waits for an answer", async () => {
    toAnswer = {
      rita: await countConversationsToAnswer(rita.client, rita.id),
      tomas: await countConversationsToAnswer(tomas.client, tomas.id),
    };
    expect(await fetchMyConversation(ana.client, ana.id, published)).toEqual({
      id: null,
      newSince: null,
      messages: [],
      hasEarlier: false,
    });

    expect(await sendCourseMessage(ana.client, published, "  Primeira pergunta\n\n")).toBe("sent");
    const first = await conversationOf(ana, published);
    expect(first).toMatchObject({ course_id: published, learner_id: ana.id, unread_since: null });
    expect(first!.unanswered_since).toBe(first!.last_message_at);

    // A second message: it has been waiting since the first.
    expect(await sendCourseMessage(ana.client, published, "Segunda pergunta")).toBe("sent");
    const second = await conversationOf(ana, published);
    expect(second!.id).toBe(first!.id);
    expect(second!.unanswered_since).toBe(first!.unanswered_since);
    expect(Date.parse(second!.last_message_at)).toBeGreaterThan(Date.parse(first!.last_message_at));
    expect(await messagesOf(first!.id)).toEqual([
      { author_id: ana.id, from_trainer: false, body: "Primeira pergunta" },
      { author_id: ana.id, from_trainer: false, body: "Segunda pergunta" },
    ]);
  });

  test("only a learner of a course that is open to them can write about it", async () => {
    expect(await sendCourseMessage(outsider.client, published, "Olá")).toBe("not_found");
    expect(await sendCourseMessage(ana.client, draft, "Olá")).toBe("not_found");
    expect(await sendCourseMessage(ana.client, randomUUID(), "Olá")).toBe("not_found");
    expect(await sendCourseMessage(ana.client, "not-an-id", "Olá")).toBe("not_found");
    // Trainers answer; they do not ask.
    expect(await sendCourseMessage(rita.client, published, "Olá")).toBe("denied");
    expect(await sendCourseMessage(visitor(), published, "Olá")).toBe("denied");

    expect(await conversationOf(outsider, published)).toBeNull();
    expect(await conversationOf(ana, draft)).toBeNull();
    expect(await conversationOf(rita, published)).toBeNull();
  });

  test("a message needs some text, and has a longest length", async () => {
    expect(await sendCourseMessage(ana.client, published, " \n\t ")).toBe("invalid");
    expect(await sendCourseMessage(ana.client, published, "a".repeat(4001))).toBe("invalid");
    const conversation = await conversationOf(ana, published);
    expect(await answerConversation(rita.client, conversation!.id, "")).toBe("invalid");
    expect(await answerConversation(rita.client, conversation!.id, "a".repeat(4001))).toBe(
      "invalid",
    );
    expect((await messagesOf(conversation!.id)).length).toBe(2);
    expect(await sendCourseMessage(bea.client, published, "a".repeat(4000))).toBe("sent");
  });

  test("nobody writes a conversation or a message through the API", async () => {
    const conversation = await conversationOf(ana, published);
    for (const client of [ana.client, rita.client]) {
      const started = await client
        .from("conversations")
        .insert({ course_id: other, learner_id: ana.id });
      expect(started.error).not.toBeNull();
      const written = await client.from("conversation_messages").insert({
        conversation_id: conversation!.id,
        author_id: rita.id,
        from_trainer: true,
        body: "Resposta forjada",
      });
      expect(written.error).not.toBeNull();
      const marked = await client
        .from("conversations")
        .update({ unanswered_since: null })
        .eq("id", conversation!.id);
      expect(marked.error).not.toBeNull();
      const edited = await client
        .from("conversation_messages")
        .update({ body: "Alterada" })
        .eq("conversation_id", conversation!.id);
      expect(edited.error).not.toBeNull();
      const erased = await client
        .from("conversation_messages")
        .delete()
        .eq("conversation_id", conversation!.id);
      expect(erased.error).not.toBeNull();
    }
    expect(await conversationOf(ana, other)).toBeNull();
    expect((await conversationOf(ana, published))!.unanswered_since).not.toBeNull();
    expect((await messagesOf(conversation!.id)).map((message) => message.body)).toEqual([
      "Primeira pergunta",
      "Segunda pergunta",
    ]);
  });

  test("a learner reads their own conversation; trainers read everyone's", async () => {
    const hers = await conversationOf(ana, published);

    const mine = await fetchMyConversation(ana.client, ana.id, published);
    expect(mine).toMatchObject({ id: hers!.id, newSince: null, hasEarlier: false });
    expect(mine.messages).toMatchObject([
      { fromTrainer: false, authorId: ana.id, authorName: "cv-ana", body: "Primeira pergunta" },
      { fromTrainer: false, authorId: ana.id, authorName: "cv-ana", body: "Segunda pergunta" },
    ]);

    // Another learner of the same course, someone outside it, a visitor: nothing.
    for (const client of [bea.client, outsider.client]) {
      expect(await fetchMyConversation(client, ana.id, published)).toMatchObject({ id: null });
      expect(await fetchThread(client, hers!.id)).toEqual({ messages: [], hasEarlier: false });
      const rows = await client
        .from("conversation_messages")
        .select("id")
        .eq("conversation_id", hers!.id);
      expect(rows.data).toEqual([]);
      const conversations = await client.from("conversations").select("id").eq("id", hers!.id);
      expect(conversations.data).toEqual([]);
    }
    expect((await visitor().from("conversations").select("id")).error).not.toBeNull();
    expect((await visitor().from("conversation_messages").select("id")).error).not.toBeNull();
    expect(
      (await visitor().rpc("conversation_thread", { target_conversation_id: hers!.id })).error,
    ).not.toBeNull();

    for (const trainer of [rita, tomas]) {
      expect((await fetchThread(trainer.client, hers!.id)).messages.length).toBe(2);
    }
    expect(await fetchThread(rita.client, "not-an-id")).toEqual({
      messages: [],
      hasEarlier: false,
    });
  });

  test("it falls to the trainers of its course, or to every trainer when it has none", async () => {
    expect(await sendCourseMessage(ana.client, other, "Uma pergunta noutro curso")).toBe("sent");

    const ours = async (trainer: TestUser) =>
      Object.fromEntries(
        (await fetchConversations(trainer.client, trainer.id, "pt"))
          .filter((row) => [ana.id, bea.id].includes(row.learner.id))
          .map((row) => [`${row.learner.name} · ${row.course.title}`, row.isMine]),
      );
    // Rita teaches the published course; nobody teaches the other one.
    expect(await ours(rita)).toEqual({
      [`cv-ana · Curso published ${runId}`]: true,
      [`cv-bea · Curso published ${runId}`]: true,
      [`cv-ana · Curso other ${runId}`]: true,
    });
    expect(await ours(tomas)).toEqual({
      [`cv-ana · Curso published ${runId}`]: false,
      [`cv-bea · Curso published ${runId}`]: false,
      [`cv-ana · Curso other ${runId}`]: true,
    });
    expect(await countConversationsToAnswer(rita.client, rita.id)).toBe(toAnswer.rita + 3);
    expect(await countConversationsToAnswer(tomas.client, tomas.id)).toBe(toAnswer.tomas + 1);

    const list = await fetchConversations(rita.client, rita.id, "en");
    const hers = list.find((row) => row.learner.id === ana.id && row.course.id === published);
    expect(hers).toMatchObject({
      course: { id: published, title: `Course published ${runId}` },
      learner: { id: ana.id, name: "cv-ana", email: ana.email },
      lastMessage: { fromTrainer: false, excerpt: "Segunda pergunta" },
    });
    expect(hers!.unansweredSince).not.toBeNull();
    // The one written in most recently comes first.
    const order = list.map((row) => row.lastMessageAt);
    expect(order).toEqual([...order].sort().reverse());

    // A learner's own client gets no more than their own.
    const asLearner = await fetchConversations(bea.client, bea.id, "pt");
    expect(asLearner.map((row) => row.learner.id)).toEqual([bea.id]);
  });

  test("a trainer answers: it stops waiting, and is new to the learner until they open it", async () => {
    const hers = await conversationOf(ana, published);
    expect(await fetchCoursesWithNewAnswers(ana.client, ana.id)).toEqual(new Set());

    expect(await answerConversation(rita.client, hers!.id, "Primeira resposta")).toBe("sent");
    const answered = await conversationOf(ana, published);
    expect(answered!.unanswered_since).toBeNull();
    expect(answered!.unread_since).toBe(answered!.last_message_at);
    expect(await countConversationsToAnswer(rita.client, rita.id)).toBe(toAnswer.rita + 2);

    // Any trainer may answer, also one who does not teach the course. Unread since the first.
    expect(await answerConversation(tomas.client, hers!.id, "Segunda resposta")).toBe("sent");
    expect((await conversationOf(ana, published))!.unread_since).toBe(answered!.unread_since);

    expect(await fetchCoursesWithNewAnswers(ana.client, ana.id)).toEqual(new Set([published]));
    expect(await fetchCoursesWithNewAnswers(bea.client, bea.id)).toEqual(new Set());
    const mine = await fetchMyConversation(ana.client, ana.id, published);
    expect(mine.newSince).toBe(answered!.unread_since);
    // The learner is told who answered, by name.
    expect(mine.messages.slice(2)).toMatchObject([
      { fromTrainer: true, authorId: rita.id, authorName: "cv-rita", body: "Primeira resposta" },
      { fromTrainer: true, authorId: tomas.id, authorName: "cv-tomas", body: "Segunda resposta" },
    ]);
    expect(
      (await fetchConversations(rita.client, rita.id, "pt")).find((row) => row.id === hers!.id)
        ?.lastMessage,
    ).toEqual({ fromTrainer: true, excerpt: "Segunda resposta" });

    // Only the learner whose conversation it is can say they have read it.
    expect(await markConversationRead(bea.client, hers!.id)).toBe(false);
    expect(await markConversationRead(rita.client, hers!.id)).toBe(false);
    expect((await conversationOf(ana, published))!.unread_since).not.toBeNull();
    expect(await markConversationRead(ana.client, hers!.id)).toBe(true);
    expect(await markConversationRead(ana.client, hers!.id)).toBe(false);
    expect((await conversationOf(ana, published))!.unread_since).toBeNull();
    expect(await fetchCoursesWithNewAnswers(ana.client, ana.id)).toEqual(new Set());
  });

  test("writing again reads what was there, and waits once more", async () => {
    const hers = await conversationOf(ana, published);
    await answerConversation(rita.client, hers!.id, "Mais uma resposta");
    expect((await conversationOf(ana, published))!.unread_since).not.toBeNull();

    expect(await sendCourseMessage(ana.client, published, "Obrigada!")).toBe("sent");
    const again = await conversationOf(ana, published);
    expect(again!.unread_since).toBeNull();
    expect(again!.unanswered_since).toBe(again!.last_message_at);
  });

  test("a learner cannot answer as a trainer, nor set a conversation aside", async () => {
    const hers = await conversationOf(ana, published);
    const beas = await conversationOf(bea, published);
    expect(await answerConversation(ana.client, hers!.id, "Resposta minha")).toBe("denied");
    expect(await answerConversation(ana.client, beas!.id, "Resposta minha")).toBe("denied");
    expect(await answerConversation(visitor(), hers!.id, "Resposta")).toBe("denied");
    expect(await answerConversation(rita.client, randomUUID(), "Resposta")).toBe("not_found");
    expect(await answerConversation(rita.client, "not-an-id", "Resposta")).toBe("not_found");

    expect(await markConversationAnswered(ana.client, hers!.id)).toBe(false);
    const direct = await ana.client.rpc("mark_conversation_answered", {
      target_conversation_id: hers!.id,
    });
    expect(direct.error).toMatchObject({ code: "42501" });
    expect((await conversationOf(ana, published))!.unanswered_since).not.toBeNull();
    expect((await messagesOf(beas!.id)).length).toBe(1);
  });

  test("a trainer sets aside a conversation whose last message needs no answer", async () => {
    const hers = await conversationOf(ana, published);
    expect(await markConversationAnswered(tomas.client, hers!.id)).toBe(true);
    expect(await markConversationAnswered(tomas.client, hers!.id)).toBe(false);
    const aside = await conversationOf(ana, published);
    expect(aside!.unanswered_since).toBeNull();
    // Nothing was written, so nothing is new to the learner.
    expect(aside!.unread_since).toBeNull();
    expect(await markConversationAnswered(rita.client, randomUUID())).toBe(false);
  });

  test("one conversation, as a trainer opens it", async () => {
    const hers = await conversationOf(ana, published);
    const page = await fetchTrainerConversation(rita.client, hers!.id, "pt");
    expect(page).toMatchObject({
      id: hers!.id,
      course: {
        id: published,
        slug: `course-published-${runId}`,
        title: `Curso published ${runId}`,
        status: "published",
      },
      learner: { id: ana.id, name: "cv-ana", email: ana.email },
      unansweredSince: null,
      unreadSince: null,
      learnerHasAccess: true,
      courseTrainers: [{ id: rita.id, name: "cv-rita" }],
      hasEarlier: false,
    });
    expect(page!.messages.map((message) => message.body)).toEqual([
      "Primeira pergunta",
      "Segunda pergunta",
      "Primeira resposta",
      "Segunda resposta",
      "Mais uma resposta",
      "Obrigada!",
    ]);
    expect(await fetchTrainerConversation(rita.client, randomUUID(), "pt")).toBeNull();
    expect(await fetchTrainerConversation(rita.client, "not-an-id", "pt")).toBeNull();
    // A learner's client finds only their own.
    expect(await fetchTrainerConversation(bea.client, hers!.id, "pt")).toBeNull();
  });

  test("a long conversation shows its latest messages", async () => {
    const beas = await conversationOf(bea, published);
    const start = Date.now() - 1000 * (THREAD_LIMIT + 10);
    const { error } = await admin()
      .from("conversation_messages")
      .insert(
        Array.from({ length: THREAD_LIMIT + 5 }, (_, index) => ({
          conversation_id: beas!.id,
          author_id: bea.id,
          from_trainer: false,
          body: `Mensagem ${index + 1}`,
          created_at: new Date(start + index * 1000).toISOString(),
        })),
      );
    expect(error).toBeNull();
    // The one she wrote herself is the newest of all.
    const thread = await fetchThread(bea.client, beas!.id);
    expect(thread.hasEarlier).toBe(true);
    expect(thread.messages.length).toBe(THREAD_LIMIT);
    expect(thread.messages[0].body).toBe("Mensagem 7");
    expect(thread.messages.at(-2)?.body).toBe(`Mensagem ${THREAD_LIMIT + 5}`);
    expect(thread.messages.at(-1)?.body).toBe("a".repeat(4000));
  });

  test("an answer stays when its trainer's account is removed, without a name", async () => {
    leaving = await createUser("trainer", "cv-leaving");
    const beas = await conversationOf(bea, published);
    expect(await answerConversation(leaving.client, beas!.id, "Resposta de quem saiu")).toBe(
      "sent",
    );
    await deleteUsers([leaving]);
    leaving = undefined;

    const last = (await fetchThread(bea.client, beas!.id)).messages.at(-1);
    expect(last).toMatchObject({
      fromTrainer: true,
      authorId: null,
      authorName: "",
      body: "Resposta de quem saiu",
    });
  });

  test("someone taken out of the course keeps the conversation, but can write no more", async () => {
    const beas = await conversationOf(bea, published);
    expect(await unenrollUser(rita.client, published, bea.id)).toBe(true);
    expect(await sendCourseMessage(bea.client, published, "Ainda posso?")).toBe("not_found");
    expect(await fetchCourseTrainerNames(bea.client, published)).toEqual([]);
    expect(await fetchTrainerConversation(rita.client, beas!.id, "pt")).toMatchObject({
      learnerHasAccess: false,
    });
    // A trainer can still answer; it waits for the day she is back in the course.
    expect(await answerConversation(rita.client, beas!.id, "Até à próxima edição.")).toBe("sent");
    await enroll(bea.id, [published]);
    expect(await fetchCoursesWithNewAnswers(bea.client, bea.id)).toEqual(new Set([published]));
  });

  test("only a trainer deletes a conversation, and its messages go with it", async () => {
    const hers = await conversationOf(ana, published);
    expect(await deleteConversation(ana.client, hers!.id)).toBe("not_found");
    expect(await deleteConversation(bea.client, hers!.id)).toBe("not_found");
    expect(await conversationOf(ana, published)).not.toBeNull();

    expect(await deleteConversation(rita.client, hers!.id)).toBe("deleted");
    expect(await deleteConversation(rita.client, hers!.id)).toBe("not_found");
    expect(await deleteConversation(rita.client, "not-an-id")).toBe("not_found");
    expect(await conversationOf(ana, published)).toBeNull();
    expect(await messagesOf(hers!.id)).toEqual([]);
    // She can start again.
    expect(await sendCourseMessage(ana.client, published, "De novo")).toBe("sent");
    expect((await conversationOf(ana, published))!.id).not.toBe(hers!.id);
  });

  test("a learner's conversations go with their account", async () => {
    const gone = await createUser("learner", "cv-gone");
    await enroll(gone.id, [published]);
    expect(await sendCourseMessage(gone.client, published, "Adeus")).toBe("sent");
    const theirs = await conversationOf(gone, published);
    await admin().from("enrollments").delete().eq("user_id", gone.id);
    await deleteUsers([gone]);
    const { data } = await admin().from("conversations").select("id").eq("id", theirs!.id);
    expect(data).toEqual([]);
    expect(await messagesOf(theirs!.id)).toEqual([]);
  });
});
