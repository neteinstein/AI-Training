import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setHiddenInEdition } from "@/features/editions/operations";
import { deleteMaterial } from "@/features/materials/operations";
import { fetchCourseContent, recordMaterialOpen } from "@/lib/dal/learner-queries";
import {
  fetchMyQuizStanding,
  fetchQuiz,
  fetchQuizForEdit,
  fetchQuizResults,
  fetchQuizStandings,
  saveQuiz,
  submitQuiz,
  type EditableQuestion,
  type QuizQuestion,
} from "@/lib/dal/quiz-queries";
import {
  admin,
  createCatalogue,
  createUser,
  defaultEdition,
  deleteCatalogue,
  deleteUsers,
  enroll,
  ensureKeeperTrainer,
  runId,
  visitor,
  type Catalogue,
  type Client,
  type TestUser,
} from "./helpers";

/**
 * Quizzes. The published course of the catalogue gets a second edition ("B") and four quizzes:
 *
 *   quiz       for every edition, two questions (the second with two right answers)
 *   quizB      only edition B has it
 *   emptyQuiz  no questions yet: it is shown to no learner
 *   draftQuiz  in the draft course, which learners cannot open
 *
 * Ana is in the general edition (and in the draft course), Bea in B.
 */

const slug = `course-published-${runId}`;

let catalogue: Catalogue;
let trainer: TestUser;
let ana: TestUser;
let bea: TestUser;
let outsider: TestUser;

let published: string;
let general: string;
let quiz: string;
let quizB: string;
let emptyQuiz: string;
let draftQuiz: string;

const text = (pt: string, en = "") => ({ pt, en });

const sums: EditableQuestion = {
  prompt: text("Quanto é 2 + 2?", "What is 2 + 2?"),
  explanation: text("Dois e dois são quatro.", "Two and two make four."),
  options: [
    { label: text("3"), correct: false },
    { label: text("4"), correct: true },
    { label: text("5"), correct: false },
  ],
};
const evens: EditableQuestion = {
  prompt: text("Quais são pares?"),
  explanation: text(""),
  options: [
    { label: text("Dois", "Two"), correct: true },
    { label: text("Três", "Three"), correct: false },
    { label: text("Quatro", "Four"), correct: true },
  ],
};

const asLearner = (user: TestUser) => ({ id: user.id, role: "learner" as const });

/** The answers a form would send: for each question (by its text), the options chosen. */
function answers(questions: QuizQuestion[], chosen: Record<string, string[]>) {
  const sent: Record<string, string[]> = {};
  for (const question of questions) {
    sent[question.id] = (chosen[question.prompt] ?? []).map((label) => {
      const option = question.options.find((candidate) => candidate.label === label);
      if (!option) throw new Error(`No option "${label}" in "${question.prompt}"`);
      return option.id;
    });
  }
  return sent;
}

const allRight = { "Quanto é 2 + 2?": ["4"], "Quais são pares?": ["Dois", "Quatro"] };

async function attemptsOf(userId: string, materialId: string) {
  const { data } = await admin()
    .from("quiz_attempts")
    .select("correct_count, question_count, edition_id, detail")
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .order("submitted_at");
  return data ?? [];
}

async function questionIds(client: Client, materialId: string) {
  const { data } = await client.from("quiz_questions").select("id").eq("material_id", materialId);
  return (data ?? []).map((row) => row.id).sort();
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  const service = admin();
  catalogue = await createCatalogue();
  published = catalogue.courses.published;
  trainer = await createUser("trainer", "qz-trainer");
  ana = await createUser("learner", "qz-ana", { full_name: "Ana Quiz" });
  bea = await createUser("learner", "qz-bea", { full_name: "Bea Quiz" });
  outsider = await createUser("learner", "qz-outsider");

  general = await defaultEdition(published);
  const edition = await service
    .from("editions")
    .insert({ course_id: published, name_pt: "Turma B", name_en: "Class B" })
    .select("id")
    .single();
  if (edition.error) throw new Error(`Edition failed: ${edition.error.message}`);
  const editionB = edition.data.id;

  const quizRow = (module_id: string, title_pt: string, sort_order: number, edition_id?: string) =>
    ({ module_id, kind: "quiz", title_pt, is_published: true, sort_order, edition_id }) as const;
  const made = await service
    .from("materials")
    .insert([
      quizRow(catalogue.modules.published, "Questionário", 30),
      quizRow(catalogue.modules.published, "Questionário da turma B", 40, editionB),
      quizRow(catalogue.modules.published, "Questionário por escrever", 50),
      quizRow(catalogue.modules.draft, "Questionário do rascunho", 30),
    ])
    .select("id, title_pt");
  if (made.error) throw new Error(`Quizzes failed: ${made.error.message}`);
  const idOf = (title: string) => made.data.find((row) => row.title_pt === title)!.id;
  quiz = idOf("Questionário");
  quizB = idOf("Questionário da turma B");
  emptyQuiz = idOf("Questionário por escrever");
  draftQuiz = idOf("Questionário do rascunho");

  await enroll(ana.id, [published, catalogue.courses.draft]);
  await enroll(bea.id, [published], { [published]: editionB });
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await deleteUsers([trainer, ana, bea, outsider]);
});

describe("quizzes: writing one", () => {
  test("a trainer saves the questions; they come back as written, with the key", async () => {
    expect(await saveQuiz(trainer.client, quiz, [sums, evens])).toEqual({ ok: true, questions: 2 });
    expect(await fetchQuizForEdit(trainer.client, quiz)).toEqual([sums, evens]);
    for (const other of [quizB, draftQuiz]) {
      expect(await saveQuiz(trainer.client, other, [sums])).toEqual({ ok: true, questions: 1 });
    }

    // Saving again replaces everything: the questions get new ids.
    const before = await questionIds(trainer.client, quiz);
    expect(await saveQuiz(trainer.client, quiz, [sums, evens])).toEqual({ ok: true, questions: 2 });
    const after = await questionIds(trainer.client, quiz);
    expect(after).toHaveLength(2);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });

  test("a quiz that is not well formed is refused, and the quiz stays as it was", async () => {
    const before = await questionIds(trainer.client, quiz);
    const one = { ...sums, options: sums.options.slice(0, 1) };
    const noneRight = {
      ...sums,
      options: sums.options.map((option) => ({ ...option, correct: false })),
    };
    const refused: Array<[string, EditableQuestion[]]> = [
      ["no questions", []],
      ["a single option", [one]],
      ["no right answer", [sums, noneRight]],
      ["a question without a text", [{ ...sums, prompt: text(" ") }]],
      [
        "an option without a text",
        [{ ...evens, options: [evens.options[0], { label: text(""), correct: false }] }],
      ],
    ];
    for (const [what, questions] of refused) {
      expect(await saveQuiz(trainer.client, quiz, questions), what).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(await questionIds(trainer.client, quiz)).toEqual(before);

    // Only a quiz has questions.
    expect(await saveQuiz(trainer.client, catalogue.materials.visible, [sums])).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveQuiz(trainer.client, randomUUID(), [sums])).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveQuiz(trainer.client, "nope", [sums])).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  test("only trainers write quizzes, and only through the function", async () => {
    const before = await questionIds(trainer.client, quiz);
    for (const client of [ana.client, outsider.client, visitor()]) {
      expect(await saveQuiz(client, quiz, [sums])).toEqual({ ok: false, reason: "failed" });
    }
    expect(await questionIds(trainer.client, quiz)).toEqual(before);

    // Not even a trainer writes the tables directly: the function keeps a quiz whole.
    for (const client of [trainer.client, ana.client]) {
      const insert = await client
        .from("quiz_questions")
        .insert({ material_id: quiz, sort_order: 9, prompt_pt: "Extra" });
      expect(insert.error?.code).toBe("42501");
      const change = await client
        .from("quiz_question_keys")
        .update({ explanation_pt: "x" })
        .eq("question_id", before[0]);
      expect(change.error?.code).toBe("42501");
      const remove = await client.from("quiz_options").delete().eq("question_id", before[0]);
      expect(remove.error?.code).toBe("42501");
    }
  });
});

describe("quizzes: reading the questions", () => {
  test("a learner reads the questions of their edition's quizzes, in their language", async () => {
    const forAna = await fetchQuiz(ana.client, quiz, "pt");
    expect(forAna.map((question) => [question.prompt, question.allowsMultiple])).toEqual([
      ["Quanto é 2 + 2?", false],
      ["Quais são pares?", true],
    ]);
    expect(forAna[1].options.map((option) => option.label)).toEqual(["Dois", "Três", "Quatro"]);

    // English where it exists; what is only in Portuguese says so.
    const inEnglish = await fetchQuiz(ana.client, quiz, "en");
    expect(inEnglish.map((question) => [question.prompt, question.promptLang])).toEqual([
      ["What is 2 + 2?", "en"],
      ["Quais são pares?", "pt"],
    ]);
    expect(inEnglish[1].options.map((option) => option.label)).toEqual(["Two", "Three", "Four"]);

    // Not another edition's quiz, not a draft course's, not as an outsider or a visitor.
    expect(await fetchQuiz(ana.client, quizB, "pt")).toEqual([]);
    expect(await fetchQuiz(ana.client, draftQuiz, "pt")).toEqual([]);
    expect(await fetchQuiz(bea.client, quizB, "pt")).toHaveLength(1);
    expect(await fetchQuiz(outsider.client, quiz, "pt")).toEqual([]);
    expect(await fetchQuiz(ana.client, "nope", "pt")).toEqual([]);
    const refused = await visitor().from("quiz_questions").select("id");
    expect(refused.error?.code).toBe("42501");
    const options = await visitor().from("quiz_options").select("id");
    expect(options.error?.code).toBe("42501");
  });

  test("what is right, and why, is not readable before handing in", async () => {
    // The key is a table of its own that only trainers read.
    const keys = await ana.client.from("quiz_question_keys").select("question_id");
    expect(keys.data).toEqual([]);
    const fromVisitor = await visitor().from("quiz_question_keys").select("question_id");
    expect(fromVisitor.error?.code).toBe("42501");
    expect(
      (await trainer.client.from("quiz_question_keys").select("question_id")).data,
    ).not.toEqual([]);

    // Asked the way the editor asks, a learner gets the questions without any key.
    const asEditor = await fetchQuizForEdit(ana.client, quiz);
    expect(asEditor).toHaveLength(2);
    expect(asEditor.flatMap((question) => question.options).some((option) => option.correct)).toBe(
      false,
    );
    expect(asEditor.map((question) => question.explanation)).toEqual([text(""), text("")]);

    // Nor does a question say more than whether several answers may be chosen.
    const raw = await ana.client.from("quiz_questions").select("*").eq("material_id", quiz);
    expect(Object.keys(raw.data![0]).sort()).toEqual([
      "allows_multiple",
      "id",
      "material_id",
      "prompt_en",
      "prompt_pt",
      "sort_order",
    ]);
  });

  test("a quiz with no questions yet is shown to no learner", async () => {
    const content = await fetchCourseContent(ana.client, asLearner(ana), slug, "pt");
    const ids = content?.modules.flatMap((module) => module.materials.map((item) => item.id));
    expect(ids).toContain(quiz);
    expect(ids).not.toContain(emptyQuiz);
    expect(ids).not.toContain(quizB);
    expect(await fetchQuiz(ana.client, emptyQuiz, "pt")).toEqual([]);
    expect(await submitQuiz(ana.client, emptyQuiz, {}, "pt")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("quizzes: handing one in", () => {
  test("the answer says what was right and why, and the attempt is kept", async () => {
    const questions = await fetchQuiz(ana.client, quiz, "pt");
    const result = await submitQuiz(ana.client, quiz, answers(questions, allRight), "pt");
    expect(result.ok && result.outcome).toMatchObject({ correct: 2, total: 2 });
    if (!result.ok) return;
    const [first, second] = result.outcome.questions;
    expect(first).toMatchObject({
      prompt: "Quanto é 2 + 2?",
      isCorrect: true,
      explanation: "Dois e dois são quatro.",
    });
    expect(first.options.map((option) => [option.label, option.chosen, option.correct])).toEqual([
      ["3", false, false],
      ["4", true, true],
      ["5", false, false],
    ]);
    expect(second).toMatchObject({ isCorrect: true, explanation: "" });

    const kept = await attemptsOf(ana.id, quiz);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ correct_count: 2, question_count: 2, edition_id: general });
    expect(await fetchMyQuizStanding(ana.client, ana.id, quiz)).toMatchObject({
      attempts: 1,
      best: 1,
      last: 1,
    });
  });

  test("a question with several right answers needs exactly those", async () => {
    const questions = await fetchQuiz(ana.client, quiz, "pt");
    const score = async (chosen: Record<string, string[]>) => {
      const result = await submitQuiz(ana.client, quiz, answers(questions, chosen), "en");
      return result.ok ? `${result.outcome.correct}/${result.outcome.total}` : result.reason;
    };
    expect(await score({ ...allRight, "Quais são pares?": ["Dois"] })).toBe("1/2");
    expect(await score({ ...allRight, "Quais são pares?": ["Dois", "Três", "Quatro"] })).toBe(
      "1/2",
    );
    expect(await score({ "Quanto é 2 + 2?": ["5"], "Quais são pares?": ["Três"] })).toBe("0/2");
    // Nothing chosen is an answer too: a wrong one.
    expect(await score({ "Quanto é 2 + 2?": ["4"] })).toBe("1/2");

    // The best result stays; the last one is the last.
    expect(await fetchMyQuizStanding(ana.client, ana.id, quiz)).toMatchObject({
      attempts: 5,
      best: 1,
      last: 0.5,
    });

    // An option of another question does not count for this one.
    const mixed = answers(questions, allRight);
    mixed[questions[0].id] = [questions[1].options[0].id];
    const wrong = await submitQuiz(ana.client, quiz, mixed, "pt");
    expect(wrong.ok && wrong.outcome.questions[0].isCorrect).toBe(false);
  });

  test("answers that do not match the quiz as it is now are refused, and nothing is kept", async () => {
    const questions = await fetchQuiz(ana.client, quiz, "pt");
    const good = answers(questions, allRight);
    const kept = (await attemptsOf(ana.id, quiz)).length;

    const [firstId, secondId] = questions.map((question) => question.id);
    const refused: Array<[string, Record<string, string[]>, "changed" | "invalid"]> = [
      ["a question missing", { [firstId]: good[firstId] }, "changed"],
      ["a question too many", { ...good, [randomUUID()]: [] }, "changed"],
      ["other questions", { [randomUUID()]: [], [randomUUID()]: [] }, "changed"],
      ["nothing", {}, "changed"],
      ["an option that is not an id", { ...good, [secondId]: ["nope"] }, "invalid"],
    ];
    for (const [what, sent, reason] of refused) {
      expect(await submitQuiz(ana.client, quiz, sent, "pt"), what).toEqual({
        ok: false,
        reason,
      });
    }
    expect(await attemptsOf(ana.id, quiz)).toHaveLength(kept);
  });

  test("only for a quiz the person may open", async () => {
    const questions = await fetchQuiz(ana.client, quiz, "pt");
    const good = answers(questions, allRight);
    const notFound = { ok: false, reason: "not_found" };

    expect(await submitQuiz(outsider.client, quiz, good, "pt")).toEqual(notFound);
    expect(await submitQuiz(ana.client, quizB, good, "pt")).toEqual(notFound);
    expect(await submitQuiz(ana.client, draftQuiz, good, "pt")).toEqual(notFound);
    expect(await submitQuiz(ana.client, catalogue.materials.visible, good, "pt")).toEqual(notFound);
    expect(await submitQuiz(ana.client, randomUUID(), good, "pt")).toEqual(notFound);
    expect(await submitQuiz(ana.client, "nope", good, "pt")).toEqual(notFound);
    // A visitor cannot even call it.
    expect(await submitQuiz(visitor(), quiz, good, "pt")).toEqual({ ok: false, reason: "failed" });
    const refused = await visitor().rpc("submit_quiz", { target_material_id: quiz, answers: good });
    expect(refused.error?.code).toBe("42501");

    // Hidden in her edition, it is gone for her; shown again, it is back.
    expect(await setHiddenInEdition(trainer.client, general, quiz, true)).toBe(true);
    expect(await fetchQuiz(ana.client, quiz, "pt")).toEqual([]);
    expect(await submitQuiz(ana.client, quiz, good, "pt")).toEqual(notFound);
    expect(await setHiddenInEdition(trainer.client, general, quiz, false)).toBe(true);
    expect(await fetchQuiz(ana.client, quiz, "pt")).toHaveLength(2);
  });

  test("a trainer can try a quiz: it is graded, and nothing is kept", async () => {
    const questions = await fetchQuiz(trainer.client, quiz, "pt");
    const result = await submitQuiz(trainer.client, quiz, answers(questions, allRight), "pt");
    expect(result.ok && result.outcome).toMatchObject({ correct: 2, total: 2 });
    expect(await attemptsOf(trainer.id, quiz)).toEqual([]);
    expect(await fetchMyQuizStanding(trainer.client, trainer.id, quiz)).toBeNull();
    // Also a draft course's quiz, which no learner can open.
    const draft = await fetchQuiz(trainer.client, draftQuiz, "pt");
    const tried = await submitQuiz(
      trainer.client,
      draftQuiz,
      answers(draft, { "Quanto é 2 + 2?": ["3"] }),
      "pt",
    );
    expect(tried.ok && tried.outcome).toMatchObject({ correct: 0, total: 1 });
  });

  test("nobody writes attempts directly, and a learner reads only their own", async () => {
    const insert = await ana.client.from("quiz_attempts").insert({
      user_id: ana.id,
      material_id: quiz,
      correct_count: 2,
      question_count: 2,
      detail: [],
    });
    expect(insert.error?.code).toBe("42501");
    const change = await ana.client
      .from("quiz_attempts")
      .update({ correct_count: 2 })
      .eq("user_id", ana.id);
    expect(change.error?.code).toBe("42501");
    const remove = await trainer.client.from("quiz_attempts").delete().eq("user_id", ana.id);
    expect(remove.error?.code).toBe("42501");

    const own = await ana.client.from("quiz_attempts").select("user_id");
    expect(new Set(own.data?.map((row) => row.user_id))).toEqual(new Set([ana.id]));
    expect((await bea.client.from("quiz_attempts").select("user_id")).data).toEqual([]);
    expect((await visitor().from("quiz_attempts").select("user_id")).error?.code).toBe("42501");
    expect((await visitor().from("quiz_results").select("user_id")).error?.code).toBe("42501");
  });
});

describe("quizzes: results and progress", () => {
  test("a trainer sees each learner's best result, attempts and last attempt", async () => {
    const forBea = await fetchQuiz(bea.client, quiz, "pt");
    const first = await submitQuiz(
      bea.client,
      quiz,
      answers(forBea, { "Quanto é 2 + 2?": ["4"], "Quais são pares?": ["Três"] }),
      "pt",
    );
    expect(first.ok && first.outcome.correct).toBe(1);

    const results = await fetchQuizResults(trainer.client, quiz);
    expect(results.map((row) => [row.name, row.attempts, row.best, row.last])).toEqual([
      ["Ana Quiz", 6, 1, 0.5],
      ["Bea Quiz", 1, 0.5, 0.5],
    ]);
    expect(await fetchQuizResults(trainer.client, quizB)).toEqual([]);
    expect(await fetchQuizResults(trainer.client, "nope")).toEqual([]);

    // A learner is only ever told about themselves.
    expect((await fetchQuizResults(bea.client, quiz)).map((row) => row.userId)).toEqual([bea.id]);
    expect(await fetchQuizResults(outsider.client, quiz)).toEqual([]);

    // The same, per person, for the trainer's page of one learner.
    const standings = await fetchQuizStandings(trainer.client, ana.id, [quiz, quizB, "nope"]);
    expect([...standings.keys()]).toEqual([quiz]);
    expect(standings.get(quiz)).toMatchObject({ attempts: 6, best: 1 });
    expect((await fetchQuizStandings(bea.client, ana.id, [quiz])).size).toBe(0);
  });

  test("a quiz counts as done when it is handed in, not when it is opened", async () => {
    const doneFor = async (user: TestUser, materialId: string) => {
      const content = await fetchCourseContent(user.client, asLearner(user), slug, "pt");
      return content?.modules
        .flatMap((module) => module.materials)
        .find((material) => material.id === materialId)?.isDone;
    };

    // Bea opens her edition's own quiz, and only that.
    expect(await doneFor(bea, quizB)).toBe(false);
    expect(await recordMaterialOpen(bea.client, quizB)).toBe(true);
    expect(await doneFor(bea, quizB)).toBe(false);
    const before = await fetchCourseContent(bea.client, asLearner(bea), slug, "pt");

    const questions = await fetchQuiz(bea.client, quizB, "pt");
    const handed = await submitQuiz(
      bea.client,
      quizB,
      answers(questions, { "Quanto é 2 + 2?": ["3"] }),
      "pt",
    );
    // Wrong answers count as done all the same: it is practice.
    expect(handed.ok && handed.outcome.correct).toBe(0);
    expect(await doneFor(bea, quizB)).toBe(true);
    const after = await fetchCourseContent(bea.client, asLearner(bea), slug, "pt");
    expect(after?.progress?.done).toBe((before?.progress?.done ?? 0) + 1);
    expect(after?.progress?.total).toBe(before?.progress?.total);

    // The one she handed in earlier is done as well; Ana's count never includes quizB.
    expect(await doneFor(bea, quiz)).toBe(true);
    expect(await doneFor(ana, quiz)).toBe(true);
    expect(await doneFor(ana, quizB)).toBeUndefined();
  });

  test("an attempt keeps its result when the quiz is rewritten, and goes when the quiz is deleted", async () => {
    const old = await fetchQuiz(ana.client, quiz, "pt");
    const stale = answers(old, allRight);
    expect(await saveQuiz(trainer.client, quiz, [evens])).toEqual({ ok: true, questions: 1 });

    // A form opened before the change has to be opened again.
    expect(await submitQuiz(ana.client, quiz, stale, "pt")).toEqual({
      ok: false,
      reason: "changed",
    });
    // What was handed in before reads as it was asked then.
    const kept = await attemptsOf(ana.id, quiz);
    expect(kept).toHaveLength(6);
    expect(kept[0]).toMatchObject({ correct_count: 2, question_count: 2 });
    expect(JSON.stringify(kept[0].detail)).toContain("Quanto é 2 + 2?");
    expect(await fetchMyQuizStanding(ana.client, ana.id, quiz)).toMatchObject({
      attempts: 6,
      best: 1,
    });

    // The new quiz is answered as it is now.
    const now = await fetchQuiz(ana.client, quiz, "pt");
    const again = await submitQuiz(
      ana.client,
      quiz,
      answers(now, { "Quais são pares?": ["Dois", "Quatro"] }),
      "pt",
    );
    expect(again.ok && again.outcome).toMatchObject({ correct: 1, total: 1 });

    // Deleting the quiz takes its questions, its key and every attempt with it.
    expect(await deleteMaterial(trainer.client, quiz)).toBe("deleted");
    expect(await attemptsOf(ana.id, quiz)).toEqual([]);
    expect(await attemptsOf(bea.id, quiz)).toEqual([]);
    expect(await questionIds(trainer.client, quiz)).toEqual([]);
    expect(await fetchQuizResults(trainer.client, quiz)).toEqual([]);
  });
});
