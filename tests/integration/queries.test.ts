import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fetchCatalog, fetchPublishedCourse, levelStep } from "@/lib/dal/catalog-queries";
import {
  fetchCourseContent,
  fetchMaterialFile,
  fetchMaterialPage,
  fetchMyCourses,
} from "@/lib/dal/learner-queries";
import {
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

let catalogue: Catalogue;
let enrolled: TestUser;
let outsider: TestUser;
let trainer: TestUser;

const slug = (key: string) => `course-${key}-${runId}`;
const asLearner = (user: TestUser) => ({ id: user.id, role: "learner" as const });
const asTrainer = (user: TestUser) => ({ id: user.id, role: "trainer" as const });

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  enrolled = await createUser("learner", "q-enrolled");
  outsider = await createUser("learner", "q-outsider");
  trainer = await createUser("trainer", "q-trainer");
  await enroll(enrolled.id, [
    catalogue.courses.published,
    catalogue.courses.draft,
    catalogue.courses.unlisted,
  ]);
});

afterAll(async () => {
  await deleteCatalogue(catalogue);
  await deleteUsers([enrolled, outsider, trainer]);
});

describe("public catalogue", () => {
  test("lists published courses only, whoever asks", async () => {
    for (const client of [visitor(), enrolled.client, trainer.client]) {
      const catalog = await fetchCatalog(client, "pt");
      const ours = catalog.courses.filter((course) => course.slug.endsWith(runId));
      expect(ours.map((course) => course.slug).sort()).toEqual([slug("other"), slug("published")]);
      expect(ours.every((course) => course.status === "published")).toBe(true);
    }
  });

  test("counts courses per area and returns text in the requested language", async () => {
    const portuguese = await fetchCatalog(visitor(), "pt");
    const english = await fetchCatalog(visitor(), "en");

    const areaPt = portuguese.areas.find((area) => area.id === catalogue.areaId);
    const areaEn = english.areas.find((area) => area.id === catalogue.areaId);
    expect(areaPt).toMatchObject({ name: `Área ${runId}`, courseCount: 2, color: "forest" });
    expect(areaEn?.name).toBe(`Area ${runId}`);

    const course = english.courses.find((entry) => entry.slug === slug("published"));
    expect(course).toMatchObject({
      title: `Course published ${runId}`,
      summary: "Summary",
      area: { id: catalogue.areaId },
      level: { slug: "introductory" },
    });
  });

  test("levels come in order with a glyph step from first to last", async () => {
    const { levels } = await fetchCatalog(visitor(), "pt");
    expect(levels[0]).toMatchObject({ slug: "introductory", name: "Iniciação", step: 1 });
    expect(levels.at(-1)).toMatchObject({ slug: "advanced", name: "Avançado", step: 3 });

    expect([0, 1].map((index) => levelStep(index, 2))).toEqual([1, 3]);
    expect([0, 1, 2].map((index) => levelStep(index, 3))).toEqual([1, 2, 3]);
    expect(levelStep(0, 1)).toBe(1);
  });

  test("a course page exists for published courses only", async () => {
    const detail = await fetchPublishedCourse(visitor(), slug("published"), "pt");
    expect(detail).toMatchObject({ slug: slug("published"), title: `Curso published ${runId}` });

    expect(await fetchPublishedCourse(visitor(), slug("draft"), "pt")).toBeNull();
    expect(await fetchPublishedCourse(visitor(), slug("unlisted"), "pt")).toBeNull();
    // Even for a trainer: the public page never shows a draft.
    expect(await fetchPublishedCourse(trainer.client, slug("draft"), "pt")).toBeNull();
    expect(await fetchPublishedCourse(visitor(), "no-such-course", "pt")).toBeNull();
  });
});

describe("learner area", () => {
  test("my courses: enrolled and open (not drafts, not other people's)", async () => {
    const mine = await fetchMyCourses(enrolled.client, enrolled.id, "pt");
    expect(mine.map((course) => course.slug).sort()).toEqual([slug("published"), slug("unlisted")]);

    expect(await fetchMyCourses(outsider.client, outsider.id, "pt")).toEqual([]);
    // Asking for someone else's list returns nothing: enrolments are private.
    expect(await fetchMyCourses(outsider.client, enrolled.id, "pt")).toEqual([]);
  });

  test("course content shows published materials to an enrolled learner", async () => {
    const content = await fetchCourseContent(
      enrolled.client,
      asLearner(enrolled),
      slug("published"),
      "pt",
    );
    expect(content?.course.slug).toBe(slug("published"));
    expect(content?.modules).toHaveLength(1);
    expect(content?.modules[0].materials.map((material) => material.id)).toEqual([
      catalogue.materials.visible,
    ]);
    expect(content?.modules[0].materials[0]).toMatchObject({
      kind: "page",
      title: "Página published",
      titleLang: "pt",
      isPublished: true,
      url: null,
      embed: null,
      file: null,
    });
  });

  test("a material written in one language falls back, and says which language it is", async () => {
    const content = await fetchCourseContent(
      enrolled.client,
      asLearner(enrolled),
      slug("published"),
      "en",
    );
    expect(content?.modules[0].title).toBe("Módulo published");
    expect(content?.modules[0].materials[0]).toMatchObject({
      title: "Página published",
      titleLang: "pt",
    });
  });

  test("a course is closed to learners who are not enrolled, and drafts to everyone but trainers", async () => {
    // Published and publicly listed, but the learner area is for enrolled people only.
    expect(
      await fetchCourseContent(outsider.client, asLearner(outsider), slug("published"), "pt"),
    ).toBeNull();
    expect(
      await fetchCourseContent(enrolled.client, asLearner(enrolled), slug("other"), "pt"),
    ).toBeNull();
    expect(
      await fetchCourseContent(enrolled.client, asLearner(enrolled), slug("draft"), "pt"),
    ).toBeNull();
    expect(
      await fetchCourseContent(enrolled.client, asLearner(enrolled), "no-such-course", "pt"),
    ).toBeNull();
  });

  test("claiming to be a trainer does not help: the database decides", async () => {
    const content = await fetchCourseContent(
      outsider.client,
      asTrainer(outsider), // a lie
      slug("published"),
      "pt",
    );
    // The public course row is readable, but no module or material comes back.
    expect(content?.modules).toEqual([]);

    expect(
      await fetchCourseContent(outsider.client, asTrainer(outsider), slug("draft"), "pt"),
    ).toBeNull();
  });

  test("a trainer sees every course with its hidden materials", async () => {
    const content = await fetchCourseContent(
      trainer.client,
      asTrainer(trainer),
      slug("published"),
      "pt",
    );
    expect(content?.modules[0].materials.map((material) => material.id).sort()).toEqual(
      [catalogue.materials.visible, catalogue.materials.hidden].sort(),
    );
    expect(
      await fetchCourseContent(trainer.client, asTrainer(trainer), slug("draft"), "pt"),
    ).not.toBeNull();
  });

  test("a material page has its text and its neighbours", async () => {
    const page = await fetchMaterialPage(
      trainer.client,
      asTrainer(trainer),
      slug("published"),
      catalogue.materials.visible,
      "pt",
    );
    expect(page?.material).toMatchObject({ kind: "page", body: "Conteúdo", bodyLang: "pt" });
    expect(page?.module.title).toBe("Módulo published");
    expect(page?.previous).toBeNull();
    expect(page?.next).toEqual({ id: catalogue.materials.hidden, title: "Página oculta" });
  });

  test("a hidden material has no page for a learner", async () => {
    expect(
      await fetchMaterialPage(
        enrolled.client,
        asLearner(enrolled),
        slug("published"),
        catalogue.materials.hidden,
        "pt",
      ),
    ).toBeNull();

    const visible = await fetchMaterialPage(
      enrolled.client,
      asLearner(enrolled),
      slug("published"),
      catalogue.materials.visible,
      "pt",
    );
    // For the learner the hidden page is not a neighbour either.
    expect(visible?.next).toBeNull();
  });

  test("the file lookup only answers for file materials the caller may read", async () => {
    expect(await fetchMaterialFile(enrolled.client, catalogue.materials.visible)).toBeNull();
    expect(await fetchMaterialFile(outsider.client, catalogue.materials.visible)).toBeNull();
    expect(
      await fetchMaterialFile(visitor(), catalogue.materials.visible).catch(() => null),
    ).toBeNull();
  });
});
