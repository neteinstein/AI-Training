import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { collectBackup, fetchBackupSummary, type BackupRow } from "@/lib/dal/backup";
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
      expect.arrayContaining(["profiles", "enrollments", "info_requests", "material_progress"]),
    );
    expect(ids(backup.tables.profiles)).toEqual(expect.arrayContaining([trainer.id, learner.id]));
    // An enrolment says which edition it is in, and that edition is in the backup too.
    expect(backup.tables.enrollments).toContainEqual(
      expect.objectContaining({
        user_id: learner.id,
        course_id: catalogue.courses.published,
        edition_id: publishedEdition,
      }),
    );
    expect(ids(backup.tables.editions)).toContain(publishedEdition);

    // What each of them has opened.
    for (const user of [learner, otherLearner]) {
      expect(backup.tables.material_progress).toContainEqual(
        expect.objectContaining({ user_id: user.id, material_id: catalogue.materials.visible }),
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
    // Their own progress, and nobody else's.
    expect(backup.tables.material_progress).toEqual([
      expect.objectContaining({ user_id: learner.id, material_id: catalogue.materials.visible }),
    ]);
    expect(backup.tables.info_requests).toEqual([]);
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
