import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { collectBackup, fetchBackupSummary, type BackupRow } from "@/lib/dal/backup";
import {
  admin,
  createCatalogue,
  createUser,
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
let fileMaterialId: string;

const ids = (rows: BackupRow[] | undefined) => (rows ?? []).map((row) => row.id as string);

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "trainer-backup");
  learner = await createUser("learner", "learner-backup");
  await enroll(learner.id, [catalogue.courses.published]);

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
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await deleteUsers([trainer, learner]);
});

describe("backup data", () => {
  test("a trainer gets every course, module and material, drafts and hidden ones included", async () => {
    // A page of two rows, so reading page by page is exercised as well.
    const backup = await collectBackup(trainer.client, { people: false, pageSize: 2 });

    expect(Object.keys(backup.tables)).toEqual([
      "areas",
      "levels",
      "courses",
      "modules",
      "materials",
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

    // Every row once, in a full copy of its columns.
    for (const rows of Object.values(backup.tables)) {
      expect(new Set(ids(rows)).size).toBe(rows.length);
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
      expect.arrayContaining(["profiles", "enrollments", "info_requests"]),
    );
    expect(ids(backup.tables.profiles)).toEqual(expect.arrayContaining([trainer.id, learner.id]));
    expect(backup.tables.enrollments).toContainEqual(
      expect.objectContaining({ user_id: learner.id, course_id: catalogue.courses.published }),
    );
  });

  test("the database still decides: a learner's client gets only what a learner may see", async () => {
    // The route refuses learners before this point; this shows the rules hold even so.
    const backup = await collectBackup(learner.client, { people: true });

    expect(ids(backup.tables.courses)).not.toContain(catalogue.courses.draft);
    expect(ids(backup.tables.materials)).not.toContain(catalogue.materials.hidden);
    expect(ids(backup.tables.materials)).not.toContain(fileMaterialId);
    expect(ids(backup.tables.profiles)).toEqual([learner.id]);
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
