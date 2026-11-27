import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setHiddenInEdition } from "@/features/editions/operations";
import { enrollUsers, moveLearner, unenrollUser } from "@/features/enrollments/operations";
import {
  fetchCourseContent,
  fetchMaterialLink,
  fetchMyCourses,
  recordMaterialOpen,
} from "@/lib/dal/learner-queries";
import { fetchCourseProgress, fetchLearnerProgress } from "@/lib/dal/trainer-queries";
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
  type TestUser,
} from "./helpers";

/**
 * Progress: which materials a learner has opened. The published course of the catalogue has
 * a visible page and a hidden one; here it also gets a link, and a second edition ("B") with
 * a page of its own. Ana is in the general edition, Bea in B.
 *
 *   Ana sees: the visible page, the link.            (2)
 *   Bea sees: the visible page, the link, B's page.  (3)
 */

const slug = `course-published-${runId}`;
const LINK = "https://example.org/leitura";

let catalogue: Catalogue;
let trainer: TestUser;
let ana: TestUser;
let bea: TestUser;
let outsider: TestUser;

let published: string;
let general: string;
let editionB: string;
let visible: string;
let link: string;
let onlyB: string;

const asLearner = (user: TestUser) => ({ id: user.id, role: "learner" as const });
const asTrainer = (user: TestUser) => ({ id: user.id, role: "trainer" as const });

async function rowsOf(userId: string) {
  const { data } = await admin()
    .from("material_progress")
    .select("material_id, opened_at, last_opened_at, completed_at")
    .eq("user_id", userId);
  return data ?? [];
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  const service = admin();
  catalogue = await createCatalogue();
  published = catalogue.courses.published;
  visible = catalogue.materials.visible;
  trainer = await createUser("trainer", "pg-trainer");
  ana = await createUser("learner", "pg-ana");
  bea = await createUser("learner", "pg-bea");
  outsider = await createUser("learner", "pg-outsider");

  general = await defaultEdition(published);
  const edition = await service
    .from("editions")
    .insert({ course_id: published, name_pt: "Turma B", name_en: "Class B" })
    .select("id")
    .single();
  if (edition.error) throw new Error(`Edition failed: ${edition.error.message}`);
  editionB = edition.data.id;

  const materials = await service
    .from("materials")
    .insert([
      {
        module_id: catalogue.modules.published,
        kind: "link" as const,
        title_pt: "Leitura",
        url: LINK,
        body_pt: null,
        is_published: true,
        edition_id: null,
        sort_order: 30,
      },
      {
        module_id: catalogue.modules.published,
        kind: "page" as const,
        title_pt: "Só da turma B",
        url: null,
        body_pt: "Texto",
        is_published: true,
        edition_id: editionB,
        sort_order: 40,
      },
    ])
    .select("id, kind");
  if (materials.error) throw new Error(`Materials failed: ${materials.error.message}`);
  link = materials.data.find((row) => row.kind === "link")!.id;
  onlyB = materials.data.find((row) => row.kind === "page")!.id;

  // Ana is also in the draft course, which learners cannot open.
  await enroll(ana.id, [published, catalogue.courses.draft]);
  await enroll(bea.id, [published], { [published]: editionB });
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await deleteUsers([trainer, ana, bea, outsider]);
});

describe("progress: noting that a material was opened", () => {
  test("it is noted once, for a learner, and only for what their edition shows", async () => {
    expect(await recordMaterialOpen(ana.client, visible)).toBe(true);
    expect(await recordMaterialOpen(ana.client, visible)).toBe(true);
    const rows = await rowsOf(ana.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].material_id).toBe(visible);
    // Opening is what counts as done; a second opening within the minute writes nothing.
    expect(rows[0].completed_at).not.toBeNull();
    expect(rows[0].last_opened_at).toBe(rows[0].opened_at);

    for (const [what, id] of [
      ["hidden from everyone", catalogue.materials.hidden],
      ["of another edition", onlyB],
      ["of a draft course", catalogue.materials.draft],
      ["of a course she is not in", catalogue.materials.other],
      ["made up", randomUUID()],
      ["not an id", "nope"],
    ] as const) {
      expect(await recordMaterialOpen(ana.client, id), what).toBe(false);
    }
    expect(await rowsOf(ana.id)).toHaveLength(1);

    // Not for someone outside the course, a trainer (who opens materials to check them) or
    // a visitor, who cannot even call it.
    expect(await recordMaterialOpen(outsider.client, visible)).toBe(false);
    expect(await recordMaterialOpen(trainer.client, visible)).toBe(false);
    expect(await recordMaterialOpen(visitor(), visible)).toBe(false);
    const refused = await visitor().rpc("record_material_open", { target_material_id: visible });
    expect(refused.error?.code).toBe("42501");
    expect(await rowsOf(outsider.id)).toEqual([]);
    expect(await rowsOf(trainer.id)).toEqual([]);
  });

  test("nobody writes progress directly; a learner reads their own, a trainer everyone's", async () => {
    const insert = await ana.client
      .from("material_progress")
      .insert({ user_id: ana.id, material_id: link });
    expect(insert.error?.code).toBe("42501");
    const change = await ana.client
      .from("material_progress")
      .update({ completed_at: null })
      .eq("user_id", ana.id);
    expect(change.error?.code).toBe("42501");
    const remove = await ana.client.from("material_progress").delete().eq("user_id", ana.id);
    expect(remove.error?.code).toBe("42501");
    // Not a trainer either: the function is the only way in.
    const byTrainer = await trainer.client
      .from("material_progress")
      .insert({ user_id: ana.id, material_id: link });
    expect(byTrainer.error?.code).toBe("42501");

    const own = await ana.client.from("material_progress").select("user_id");
    expect(own.data).toEqual([{ user_id: ana.id }]);
    const others = await bea.client.from("material_progress").select("user_id");
    expect(others.data).toEqual([]);
    const all = await trainer.client
      .from("material_progress")
      .select("user_id")
      .eq("material_id", visible);
    expect(all.data).toEqual([{ user_id: ana.id }]);
    const none = await visitor().from("material_progress").select("user_id");
    expect(none.error?.code).toBe("42501");
  });
});

describe("progress: what learners and trainers are shown", () => {
  test("the learner area ticks what was opened and counts it against what is shown", async () => {
    const forAna = await fetchCourseContent(ana.client, asLearner(ana), slug, "pt");
    expect(forAna?.progress).toEqual({ done: 1, total: 2 });
    expect(forAna?.modules[0].materials.map((material) => [material.id, material.isDone])).toEqual([
      [visible, true],
      [link, false],
    ]);

    // The list of her courses says the same. The draft course is not among them.
    const mine = await fetchMyCourses(ana.client, ana.id, "pt");
    expect(mine.map((course) => [course.id, course.progress])).toEqual([
      [published, { done: 1, total: 2 }],
    ]);

    // Bea has opened nothing yet, and has one material more to open.
    const forBea = await fetchCourseContent(bea.client, asLearner(bea), slug, "pt");
    expect(forBea?.progress).toEqual({ done: 0, total: 3 });

    // A trainer has no progress of their own.
    const forTrainer = await fetchCourseContent(trainer.client, asTrainer(trainer), slug, "pt");
    expect(forTrainer?.progress).toBeNull();
    expect(forTrainer?.modules[0].materials.some((material) => material.isDone)).toBe(false);
  });

  test("a trainer sees how far each learner is, and what each one opened", async () => {
    expect(await recordMaterialOpen(bea.client, onlyB)).toBe(true);

    const overview = await fetchCourseProgress(trainer.client, published);
    expect([...overview.keys()].sort()).toEqual([ana.id, bea.id].sort());
    expect(overview.get(ana.id)).toMatchObject({ done: 1, total: 2 });
    expect(overview.get(bea.id)).toMatchObject({ done: 1, total: 3 });
    expect(overview.get(ana.id)?.lastActivityAt).not.toBeNull();

    const detail = await fetchLearnerProgress(trainer.client, published, ana.id);
    expect([...detail.keys()].sort()).toEqual([visible, link].sort());
    expect(detail.get(visible)).toMatchObject({ isDone: true });
    expect(detail.get(visible)?.openedAt).not.toBeNull();
    expect(detail.get(link)).toEqual({ openedAt: null, lastOpenedAt: null, isDone: false });

    // Only trainers are told: a learner gets nothing, about others or about themselves.
    expect((await fetchCourseProgress(ana.client, published)).size).toBe(0);
    expect((await fetchLearnerProgress(ana.client, published, ana.id)).size).toBe(0);
    expect((await fetchLearnerProgress(trainer.client, published, outsider.id)).size).toBe(0);
    expect((await fetchCourseProgress(trainer.client, "nope")).size).toBe(0);
  });

  test("what is counted follows what the edition shows now", async () => {
    const reached = async (user: TestUser) => {
      const progress = (await fetchCourseProgress(trainer.client, published)).get(user.id);
      return progress ? `${progress.done}/${progress.total}` : "not counted";
    };

    // Hiding a material she had opened lowers the count and the total together.
    expect(await setHiddenInEdition(trainer.client, general, visible, true)).toBe(true);
    expect(await reached(ana)).toBe("0/1");
    expect((await fetchCourseContent(ana.client, asLearner(ana), slug, "pt"))?.progress).toEqual({
      done: 0,
      total: 1,
    });
    expect(await setHiddenInEdition(trainer.client, general, visible, false)).toBe(true);
    expect(await reached(ana)).toBe("1/2");

    // Someone who is moved is counted against the new edition; what they opened is kept.
    expect(await reached(bea)).toBe("1/3");
    expect(await moveLearner(trainer.client, published, bea.id, general)).toBe(true);
    expect(await reached(bea)).toBe("0/2");
    expect(await moveLearner(trainer.client, published, bea.id, editionB)).toBe(true);
    expect(await reached(bea)).toBe("1/3");

    // Someone who leaves the course is no longer counted; coming back, they are where they were.
    expect(await unenrollUser(trainer.client, published, ana.id)).toBe(true);
    expect(await reached(ana)).toBe("not counted");
    expect(await rowsOf(ana.id)).toHaveLength(1);
    expect(await recordMaterialOpen(ana.client, link)).toBe(false);
    expect(await enrollUsers(trainer.client, published, [ana.id], trainer.id)).toEqual({
      ok: true,
      added: 1,
    });
    expect(await reached(ana)).toBe("1/2");
  });

  test("the address of a link is only given to those who may open it", async () => {
    expect(await fetchMaterialLink(ana.client, link)).toBe(LINK);
    expect(await fetchMaterialLink(trainer.client, link)).toBe(LINK);
    expect(await fetchMaterialLink(outsider.client, link)).toBeNull();
    // Not a link, not an id.
    expect(await fetchMaterialLink(ana.client, visible)).toBeNull();
    expect(await fetchMaterialLink(ana.client, "nope")).toBeNull();
  });
});
