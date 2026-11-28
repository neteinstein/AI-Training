import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { answerConversation, sendCourseMessage } from "@/features/conversations/operations";
import { setCourseTrainers } from "@/features/courses/operations";
import { collectBackup, fetchBackupSummary, type BackupRow } from "@/lib/dal/backup";
import { saveQuiz } from "@/lib/dal/quiz-queries";
import {
  admin,
  createCatalogue,
  createUser,
  defaultEdition,
  deleteCatalogue,
  deleteUsers,
  enroll,
  ensureKeeperTrainer,
  type Catalogue,
  type TestUser,
} from "./helpers";

let catalogue: Catalogue;
let trainer: TestUser;
let learner: TestUser;
/** Someone else with progress of their own, which the first learner must not be handed. */
let otherLearner: TestUser;
let fileMaterialId: string;
/** The editions the published and the draft course were created with. */
let publishedEdition: string;
let draftEdition: string;
/** A second edition of the published course, which hides one of its materials. */
let secondEdition: string;
/** A quiz of one question in the published course, handed in once by each learner. */
let quizId: string;

const ids = (rows: BackupRow[] | undefined) => (rows ?? []).map((row) => row.id as string);
/** What tells one row from another: its id, or all of it where a table has none. */
const keyOf = (row: BackupRow) => (typeof row.id === "string" ? row.id : JSON.stringify(row));

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "trainer-backup");
  learner = await createUser("learner", "learner-backup");
  otherLearner = await createUser("learner", "learner-backup-other");
  await enroll(learner.id, [catalogue.courses.published]);
  await enroll(otherLearner.id, [catalogue.courses.published]);
  // Each has opened the published page.
  const { error: progressError } = await admin()
    .from("material_progress")
    .insert(
      [learner, otherLearner].map((user) => ({
        user_id: user.id,
        material_id: catalogue.materials.visible,
        completed_at: new Date().toISOString(),
      })),
    );
  if (progressError) throw new Error(`Progress failed: ${progressError.message}`);

  const { data: quiz, error: quizError } = await admin()
    .from("materials")
    .insert({
      module_id: catalogue.modules.published,
      kind: "quiz",
      title_pt: "Questionário",
      is_published: true,
      sort_order: 30,
    })
    .select("id")
    .single();
  if (quizError || !quiz) throw new Error(`Quiz failed: ${quizError?.message}`);
  quizId = quiz.id;
  const saved = await saveQuiz(trainer.client, quizId, [
    {
      prompt: { pt: "Quanto é 2 + 2?", en: "What is 2 + 2?" },
      explanation: { pt: "Dois e dois são quatro.", en: "Two and two make four." },
      options: [
        { label: { pt: "4", en: "4" }, correct: true },
        { label: { pt: "5", en: "5" }, correct: false },
      ],
    },
  ]);
  if (!saved.ok) throw new Error(`Saving the quiz failed: ${saved.reason}`);
  const { error: attemptError } = await admin()
    .from("quiz_attempts")
    .insert(
      [learner, otherLearner].map((user) => ({
        user_id: user.id,
        material_id: quizId,
        edition_id: publishedEdition,
        correct_count: 1,
        question_count: 1,
        detail: [],
      })),
    );
  if (attemptError) throw new Error(`Attempts failed: ${attemptError.message}`);

  // A file in the draft course, not published: only a trainer's backup should hold it.
  const { data, error } = await admin()
    .from("materials")
    .insert({
      module_id: catalogue.modules.draft,
      kind: "file",
      title_pt: "Diapositivos",
      storage_path: `${catalogue.courses.draft}/${randomUUID()}.pdf`,
      file_name: "Diapositivos da sessão.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      is_published: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`File material failed: ${error?.message}`);
  fileMaterialId = data.id;

  publishedEdition = await defaultEdition(catalogue.courses.published);
  draftEdition = await defaultEdition(catalogue.courses.draft);
  const { data: edition, error: editionError } = await admin()
    .from("editions")
    .insert({ course_id: catalogue.courses.published, name_pt: "Turma B", name_en: "Class B" })
    .select("id")
    .single();
  if (editionError || !edition) throw new Error(`Edition failed: ${editionError?.message}`);
  secondEdition = edition.id;
  const { error: hideError } = await admin()
    .from("edition_hidden_materials")
    .insert({ edition_id: secondEdition, material_id: catalogue.materials.visible });
  if (hideError) throw new Error(`Hiding a material failed: ${hideError.message}`);

  // The trainer teaches the published course. Each learner has written to them about it, and
  // the first has had an answer.
  if (!(await setCourseTrainers(trainer.client, catalogue.courses.published, [trainer.id]))) {
    throw new Error("Choosing the course's trainer failed");
  }
  for (const user of [learner, otherLearner]) {
    const sent = await sendCourseMessage(user.client, catalogue.courses.published, "Uma pergunta");
    if (sent !== "sent") throw new Error(`Writing to the trainers failed: ${sent}`);
  }
  const { data: asked } = await admin()
    .from("conversations")
    .select("id")
    .eq("learner_id", learner.id)
    .single();
  const answered = await answerConversation(trainer.client, asked!.id, "Uma resposta");
  if (answered !== "sent") throw new Error(`Answering failed: ${answered}`);
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await deleteUsers([trainer, learner, otherLearner]);
});

describe("backup data", () => {
  test("a trainer gets every course, module and material, drafts and hidden ones included", async () => {
    // A page of two rows, so reading page by page is exercised as well.
    const backup = await collectBackup(trainer.client, { people: false, pageSize: 2 });

    expect(Object.keys(backup.tables)).toEqual([
      "areas",
      "levels",
      "courses",
      "editions",
      "modules",
      "materials",
      "edition_hidden_materials",
      "quiz_questions",
      "quiz_options",
      "quiz_question_keys",
    ]);
    expect(ids(backup.tables.areas)).toContain(catalogue.areaId);
    expect(ids(backup.tables.levels)).toContain(catalogue.levelId);
    expect(ids(backup.tables.courses)).toEqual(
      expect.arrayContaining(Object.values(catalogue.courses)),
    );
    expect(ids(backup.tables.modules)).toEqual(
      expect.arrayContaining(Object.values(catalogue.modules)),
    );
    expect(ids(backup.tables.materials)).toEqual(
      expect.arrayContaining([...Object.values(catalogue.materials), fileMaterialId]),
    );

    // Every edition, the ones no learner is in as well, and what an edition hides.
    expect(ids(backup.tables.editions)).toEqual(
      expect.arrayContaining([publishedEdition, draftEdition, secondEdition]),
    );
    expect(backup.tables.edition_hidden_materials).toContainEqual(
      expect.objectContaining({
        edition_id: secondEdition,
        material_id: catalogue.materials.visible,
      }),
    );

    // A quiz whole: its question, the options, and which of them is right and why.
    const questions = backup.tables.quiz_questions!.filter((row) => row.material_id === quizId);
    expect(questions).toEqual([
      expect.objectContaining({ prompt_pt: "Quanto é 2 + 2?", prompt_en: "What is 2 + 2?" }),
    ]);
    const options = backup.tables.quiz_options!.filter(
      (row) => row.question_id === questions[0].id,
    );
    expect(options.map((row) => row.label_pt)).toEqual(["4", "5"]);
    expect(backup.tables.quiz_question_keys).toContainEqual(
      expect.objectContaining({
        question_id: questions[0].id,
        correct_option_ids: [options[0].id],
        explanation_pt: "Dois e dois são quatro.",
      }),
    );

    // Every row once, in a full copy of its columns.
    for (const rows of Object.values(backup.tables)) {
      expect(new Set(rows.map(keyOf)).size).toBe(rows.length);
    }
    const hidden = backup.tables.materials!.find((row) => row.id === catalogue.materials.hidden);
    expect(hidden).toMatchObject({ kind: "page", body_pt: "Rascunho", is_published: false });

    const file = backup.files.find((entry) => entry.materialId === fileMaterialId);
    expect(file).toMatchObject({
      fileName: "Diapositivos da sessão.pdf",
      courseSlug: expect.stringMatching(/^course-draft-/),
      sizeBytes: 1234,
    });
  });

  test("people are only read when asked for, and then in full", async () => {
    const backup = await collectBackup(trainer.client, { people: true });

    expect(Object.keys(backup.tables)).toEqual(
      expect.arrayContaining([
        "profiles",
        "enrollments",
        "info_requests",
        "material_progress",
        "quiz_attempts",
        "course_trainers",
        "conversations",
        "conversation_messages",
      ]),
    );
    expect(ids(backup.tables.profiles)).toEqual(expect.arrayContaining([trainer.id, learner.id]));
    // Who teaches the course, and what its learners and its trainer wrote to each other.
    expect(backup.tables.course_trainers).toContainEqual(
      expect.objectContaining({ course_id: catalogue.courses.published, user_id: trainer.id }),
    );
    const conversations = backup.tables.conversations!.filter(
      (row) => row.course_id === catalogue.courses.published,
    );
    expect(conversations.map((row) => row.learner_id).sort()).toEqual(
      [learner.id, otherLearner.id].sort(),
    );
    const written = backup.tables.conversation_messages!.filter((row) =>
      ids(conversations).includes(row.conversation_id as string),
    );
    expect(written.map((row) => row.body).sort()).toEqual([
      "Uma pergunta",
      "Uma pergunta",
      "Uma resposta",
    ]);
    // An enrolment says which edition it is in, and that edition is in the backup too.
    expect(backup.tables.enrollments).toContainEqual(
      expect.objectContaining({
        user_id: learner.id,
        course_id: catalogue.courses.published,
        edition_id: publishedEdition,
      }),
    );
    expect(ids(backup.tables.editions)).toContain(publishedEdition);

    // What each of them has opened, and the quiz each handed in.
    for (const user of [learner, otherLearner]) {
      expect(backup.tables.material_progress).toContainEqual(
        expect.objectContaining({ user_id: user.id, material_id: catalogue.materials.visible }),
      );
      expect(backup.tables.quiz_attempts).toContainEqual(
        expect.objectContaining({ user_id: user.id, material_id: quizId, correct_count: 1 }),
      );
    }
    expect(new Set(backup.tables.material_progress!.map(keyOf)).size).toBe(
      backup.tables.material_progress!.length,
    );
  });

  test("the database still decides: a learner's client gets only what a learner may see", async () => {
    // The route refuses learners before this point; this shows the rules hold even so.
    const backup = await collectBackup(learner.client, { people: true });

    expect(ids(backup.tables.courses)).not.toContain(catalogue.courses.draft);
    expect(ids(backup.tables.materials)).not.toContain(catalogue.materials.hidden);
    expect(ids(backup.tables.materials)).not.toContain(fileMaterialId);
    // Of the editions, the learner's own; not another one, a draft's, or what any of them hides.
    expect(ids(backup.tables.editions)).toContain(publishedEdition);
    expect(ids(backup.tables.editions)).not.toContain(secondEdition);
    expect(ids(backup.tables.editions)).not.toContain(draftEdition);
    expect(backup.tables.edition_hidden_materials).toEqual([]);
    expect(ids(backup.tables.profiles)).toEqual([learner.id]);
    // Their own progress and their own quiz, and nobody else's.
    expect(backup.tables.material_progress).toEqual([
      expect.objectContaining({ user_id: learner.id, material_id: catalogue.materials.visible }),
    ]);
    expect(backup.tables.quiz_attempts).toEqual([
      expect.objectContaining({ user_id: learner.id, material_id: quizId }),
    ]);
    // The questions of their course's quiz, but never which answers are right.
    expect(backup.tables.quiz_questions).toContainEqual(
      expect.objectContaining({ material_id: quizId }),
    );
    expect(backup.tables.quiz_question_keys).toEqual([]);
    expect(backup.tables.info_requests).toEqual([]);
    // Their own conversation, with the answer they were given, and nobody else's. Not the
    // list of who teaches what: a learner is told their trainers' names another way.
    expect(backup.tables.conversations).toEqual([
      expect.objectContaining({ learner_id: learner.id }),
    ]);
    expect(backup.tables.conversation_messages!.map((row) => row.body)).toEqual([
      "Uma pergunta",
      "Uma resposta",
    ]);
    expect(backup.tables.course_trainers).toEqual([]);
    expect(backup.files.map((entry) => entry.materialId)).not.toContain(fileMaterialId);
  });

  test("the summary counts what a backup would hold", async () => {
    const summary = await fetchBackupSummary(trainer.client);
    const backup = await collectBackup(trainer.client, { people: true });

    expect(summary).toMatchObject({
      courses: backup.tables.courses!.length,
      modules: backup.tables.modules!.length,
      materials: backup.tables.materials!.length,
      files: backup.files.length,
      people: backup.tables.profiles!.length,
      requests: backup.tables.info_requests!.length,
    });
    expect(summary.fileBytes).toBeGreaterThanOrEqual(1234);
  });
});
