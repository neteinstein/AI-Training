import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { changePassword, updateProfile } from "@/features/account/operations";
import {
  createArea,
  createLevel,
  deleteArea,
  deleteLevel,
  freeSlug,
  moveArea,
  moveLevel,
  updateArea,
  updateLevel,
  type AreaInput,
} from "@/features/catalog/operations";
import {
  createCourse,
  deleteCourse,
  moveCourse,
  setCourseStatus,
  updateCourse,
  type CourseInput,
} from "@/features/courses/operations";
import { enrollUsers, setUserCourses, unenrollUser } from "@/features/enrollments/operations";
import {
  createFileMaterial,
  createMaterial,
  createModule,
  deleteMaterial,
  deleteModule,
  moveMaterial,
  moveMaterialToModule,
  moveModule,
  prepareUpload,
  publishModuleMaterials,
  removeAbandonedUploads,
  replaceMaterialFile,
  setMaterialPublished,
  updateFileDetails,
  updateMaterial,
  updateModule,
  type MaterialDetails,
} from "@/features/materials/operations";
import {
  deleteRequest,
  inviteFromRequest,
  setRequestStatus,
  submitInfoRequest,
} from "@/features/requests/operations";
import { setUserRole } from "@/features/users/operations";
import { moved } from "@/lib/dal/mutations";
import { buildSamplePdf } from "../fixtures/sample-pdf";
import {
  admin,
  BUCKET,
  createCatalogue,
  createUser,
  deleteCatalogue,
  deleteUsers,
  ensureKeeperTrainer,
  PASSWORD,
  runId,
  subjectsSentTo,
  visitor,
  type Catalogue,
  type Client,
  type TestUser,
} from "./helpers";

const pdf = buildSamplePdf(1, "Back-office test");
const none = { pt: "", en: "" };

let catalogue: Catalogue;
let trainer: TestUser;
let learner: TestUser;
let other: TestUser;

const objectExists = async (path: string) =>
  (await admin().storage.from(BUCKET).download(path)).error === null;

async function uploadTo(courseId: string, client: Client = trainer.client) {
  const path = `${courseId}/${randomUUID()}.pdf`;
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: "application/pdf" });
  expect(error).toBeNull();
  return path;
}

/** The given rows in the order the app shows them. */
async function shownOrder(table: "areas" | "levels" | "courses", ids: string[]): Promise<string[]> {
  const { data } = await admin().from(table).select("id").order("sort_order").order("slug");
  return (data ?? []).map((row) => row.id).filter((id) => ids.includes(id));
}

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "bo-trainer");
  learner = await createUser("learner", "bo-learner");
  other = await createUser("learner", "bo-other");
});

afterAll(async () => {
  const service = admin();
  await service.from("info_requests").delete().like("email", `%-${runId}@example.test`);
  const { data: invited } = await service
    .from("profiles")
    .select("id")
    .like("email", `bo-request-%-${runId}@example.test`);
  for (const row of invited ?? []) await service.auth.admin.deleteUser(row.id);

  const { data: courses } = await service.from("courses").select("id").like("slug", `%-${runId}`);
  const courseIds = (courses ?? []).map((row) => row.id);
  if (courseIds.length > 0) {
    await service.from("enrollments").delete().in("course_id", courseIds);
    await service.from("courses").delete().in("id", courseIds);
  }
  await deleteCatalogue(catalogue);
  await service.from("areas").delete().like("slug", `%-${runId}`);
  await service.from("levels").delete().like("slug", `%-${runId}`);
  await deleteUsers([learner, other, trainer]);
});

describe("moving an item in a list", () => {
  test("swaps it with its neighbour, and refuses at the ends", () => {
    expect(moved(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], "a", "up")).toBeNull();
    expect(moved(["a", "b", "c"], "c", "down")).toBeNull();
    expect(moved(["a", "b", "c"], "x", "up")).toBeNull();
  });
});

describe("areas", () => {
  const area = (key: string, overrides: Partial<AreaInput> = {}): AreaInput => ({
    slug: `bo-area-${key}-${runId}`,
    name: { pt: ` Área ${key} `, en: `Area ${key}` },
    description: { pt: "  ", en: "For testing" },
    color: "ocean",
    icon: "stethoscope",
    ...overrides,
  });

  test("create, edit, order and delete", async () => {
    const created = [];
    for (const key of ["a", "b", "c"]) {
      const result = await createArea(trainer.client, area(key));
      expect(result.ok).toBe(true);
      if (result.ok) created.push(result.id);
    }
    const [a, b, c] = created;

    const { data: row } = await admin().from("areas").select("*").eq("id", a).single();
    expect(row).toMatchObject({
      name_pt: "Área a",
      name_en: "Area a",
      description_pt: null,
      description_en: "For testing",
      color: "ocean",
      icon: "stethoscope",
    });

    // New areas go to the end, in the order they were made.
    expect(await shownOrder("areas", created)).toEqual([a, b, c]);
    expect(await moveArea(trainer.client, c, "up")).toBe(true);
    expect(await shownOrder("areas", created)).toEqual([a, c, b]);
    expect(await moveArea(trainer.client, a, "down")).toBe(true);
    expect(await shownOrder("areas", created)).toEqual([c, a, b]);
    expect(await moveArea(trainer.client, b, "down")).toBe(false);

    expect(await updateArea(trainer.client, a, area("a", { color: "plum", icon: "leaf" }))).toEqual(
      { ok: true, id: a },
    );
    const { data: updated } = await admin()
      .from("areas")
      .select("color, icon")
      .eq("id", a)
      .single();
    expect(updated).toEqual({ color: "plum", icon: "leaf" });

    expect(await deleteArea(trainer.client, b)).toBe("deleted");
    expect(await deleteArea(trainer.client, b)).toBe("not_found");
  });

  test("refuses a taken address and incomplete or unknown values", async () => {
    expect(await createArea(trainer.client, area("a"))).toEqual({
      ok: false,
      reason: "slug_taken",
    });
    const invalid: Array<Partial<AreaInput>> = [
      { slug: "Not A Slug" },
      { name: { pt: "Só português", en: " " } },
      { color: "magenta" as AreaInput["color"] },
      { icon: "skull" },
    ];
    for (const overrides of invalid) {
      expect(await createArea(trainer.client, area("bad", overrides))).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(await updateArea(trainer.client, randomUUID(), area("ghost"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await updateArea(trainer.client, "not-an-id", area("ghost"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  test("an area with courses cannot be deleted", async () => {
    expect(await deleteArea(trainer.client, catalogue.areaId)).toBe("in_use");
  });

  test("a learner changes nothing", async () => {
    expect(await createArea(learner.client, area("learner"))).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(await updateArea(learner.client, catalogue.areaId, area("learner"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteArea(learner.client, catalogue.areaId)).toBe("not_found");

    const { data: before } = await admin().from("areas").select("id, sort_order").order("id");
    await moveArea(learner.client, catalogue.areaId, "up");
    const { data: after } = await admin().from("areas").select("id, sort_order").order("id");
    expect(after).toEqual(before);
  });
});

describe("levels", () => {
  test("create, edit, order and delete; the two starting levels stay in place", async () => {
    const input = (key: string) => ({
      slug: `bo-level-${key}-${runId}`,
      name: { pt: `Nível ${key}`, en: `Level ${key}` },
      description: none,
    });
    const first = await createLevel(trainer.client, input("x"));
    const second = await createLevel(trainer.client, input("y"));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(await createLevel(trainer.client, input("x"))).toEqual({
      ok: false,
      reason: "slug_taken",
    });
    expect(await shownOrder("levels", [first.id, second.id])).toEqual([first.id, second.id]);
    expect(await moveLevel(trainer.client, second.id, "up")).toBe(true);
    expect(await shownOrder("levels", [first.id, second.id])).toEqual([second.id, first.id]);

    expect(
      await updateLevel(trainer.client, first.id, {
        ...input("x"),
        name: { pt: "Intermédio", en: "Intermediate" },
      }),
    ).toEqual({ ok: true, id: first.id });

    expect(await deleteLevel(trainer.client, catalogue.levelId)).toBe("in_use");
    expect(await deleteLevel(trainer.client, first.id)).toBe("deleted");
    expect(await deleteLevel(trainer.client, second.id)).toBe("deleted");
    expect(await createLevel(learner.client, input("z"))).toEqual({ ok: false, reason: "failed" });

    const { data } = await admin().from("levels").select("slug").order("sort_order").order("slug");
    const slugs = (data ?? []).map((row) => row.slug);
    expect(slugs.indexOf("introductory")).toBeLessThan(slugs.indexOf("advanced"));
  });

  test("a free address is proposed when the wanted one is taken", async () => {
    expect(await freeSlug(trainer.client, "levels", "introductory")).toBe("introductory-2");
    expect(await freeSlug(trainer.client, "levels", `unused-${runId}`)).toBe(`unused-${runId}`);
    expect(await freeSlug(trainer.client, "courses", `course-draft-${runId}`)).toBe(
      `course-draft-${runId}-2`,
    );
    expect(await freeSlug(trainer.client, "areas", "Not a slug")).toBe("item");
  });
});

describe("courses", () => {
  const course = (key: string, overrides: Partial<CourseInput> = {}): CourseInput => ({
    slug: `bo-course-${key}-${runId}`,
    areaId: catalogue.areaId,
    levelId: catalogue.levelId,
    title: { pt: `Curso ${key}`, en: `Course ${key}` },
    summary: none,
    description: { pt: "## Programa\n\nTexto.", en: "" },
    durationHours: 7.54,
    ...overrides,
  });

  test("a new course is a draft, and needs both summaries before it can be published", async () => {
    const created = await createCourse(trainer.client, course("life"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const read = async () =>
      (await admin().from("courses").select("*").eq("id", created.id).single()).data!;

    expect(await read()).toMatchObject({
      status: "draft",
      summary_pt: null,
      description_pt: "## Programa\n\nTexto.",
      description_en: null,
      duration_hours: 7.5,
      published_at: null,
    });

    expect(await setCourseStatus(trainer.client, created.id, "published")).toBe("needs_summaries");
    expect(await setCourseStatus(trainer.client, created.id, "unlisted")).toBe("needs_summaries");

    const withSummaries = course("life", { summary: { pt: "Resumo", en: "Summary" } });
    expect(await updateCourse(trainer.client, created.id, withSummaries)).toEqual(created);
    expect(await setCourseStatus(trainer.client, created.id, "published")).toBe("ok");
    const firstPublished = (await read()).published_at;
    expect(firstPublished).not.toBeNull();

    // Once public, the summaries cannot be emptied again.
    expect(
      await updateCourse(trainer.client, created.id, course("life", { summary: none })),
    ).toEqual({ ok: false, reason: "needs_summaries" });
    expect((await read()).summary_en).toBe("Summary");

    // Unlisting and publishing again keeps the original publication date.
    expect(await setCourseStatus(trainer.client, created.id, "unlisted")).toBe("ok");
    expect(await setCourseStatus(trainer.client, created.id, "published")).toBe("ok");
    expect((await read()).published_at).toBe(firstPublished);

    expect(await setCourseStatus(trainer.client, created.id, "draft")).toBe("ok");
    expect(await setCourseStatus(trainer.client, randomUUID(), "draft")).toBe("not_found");
  });

  test("refuses a taken address and impossible values", async () => {
    expect(await createCourse(trainer.client, course("life"))).toEqual({
      ok: false,
      reason: "slug_taken",
    });
    const invalid: Array<Partial<CourseInput>> = [
      { title: { pt: "Só português", en: "" } },
      { areaId: randomUUID() }, // an area that does not exist
      { levelId: "nope" },
      { durationHours: 0 },
      { durationHours: Number.NaN },
      { slug: "com espaços" },
    ];
    for (const overrides of invalid) {
      expect(await createCourse(trainer.client, course("bad", overrides))).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });

  test("courses can be reordered", async () => {
    const ids = [catalogue.courses.published, catalogue.courses.other];
    const before = await shownOrder("courses", ids);
    expect(await moveCourse(trainer.client, before[1], "up")).toBe(true);
    const after = await shownOrder("courses", ids);
    expect(after).toEqual([before[1], before[0]]);
  });

  test("a course with learners is kept; an empty one goes with its files", async () => {
    const created = await createCourse(trainer.client, course("gone"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const section = await createModule(trainer.client, created.id, {
      title: { pt: "Módulo", en: "" },
      description: none,
    });
    expect(section.ok).toBe(true);
    if (!section.ok) return;
    const path = await uploadTo(created.id);
    const file = await createFileMaterial(trainer.client, {
      moduleId: section.id,
      storagePath: path,
      originalName: "programa.pdf",
      title: { pt: "Programa", en: "" },
      description: none,
      contentLanguage: "pt",
      isPublished: true,
    });
    expect(file.ok).toBe(true);

    await enrollUsers(trainer.client, created.id, [learner.id], trainer.id);
    expect(await deleteCourse(trainer.client, created.id)).toBe("has_learners");
    expect(await objectExists(path)).toBe(true);

    expect(await deleteCourse(learner.client, created.id)).toBe("not_found");

    expect(await unenrollUser(trainer.client, created.id, learner.id)).toBe(true);
    expect(await deleteCourse(trainer.client, created.id)).toBe("deleted");
    expect(await objectExists(path)).toBe(false);
    expect(await deleteCourse(trainer.client, created.id)).toBe("not_found");
  });

  test("a learner changes nothing", async () => {
    expect(await createCourse(learner.client, course("learner"))).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(await setCourseStatus(learner.client, catalogue.courses.draft, "published")).toBe(
      "not_found",
    );
    expect(
      await updateCourse(learner.client, catalogue.courses.published, course("learner")),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("modules and materials", () => {
  const details = (pt: string, overrides: Partial<MaterialDetails> = {}): MaterialDetails => ({
    title: { pt, en: "" },
    description: none,
    contentLanguage: null,
    isPublished: false,
    ...overrides,
  });
  const materialRow = async (id: string) =>
    (await admin().from("materials").select("*").eq("id", id).single()).data!;
  const materialOrder = async (moduleId: string) => {
    const { data } = await admin()
      .from("materials")
      .select("id")
      .eq("module_id", moduleId)
      .order("sort_order")
      .order("created_at");
    return (data ?? []).map((row) => row.id);
  };

  let moduleId: string;
  let secondModuleId: string;

  test("modules: create, rename, order and delete", async () => {
    const first = await createModule(trainer.client, catalogue.courses.draft, {
      title: { pt: " Planificar aulas ", en: "" },
      description: { pt: "", en: "What we cover" },
    });
    const second = await createModule(trainer.client, catalogue.courses.draft, {
      title: { pt: "", en: "Assessment" },
      description: none,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    moduleId = first.id;
    secondModuleId = second.id;

    const order = async () => {
      const { data } = await admin()
        .from("modules")
        .select("id")
        .eq("course_id", catalogue.courses.draft)
        .order("sort_order")
        .order("created_at");
      return (data ?? []).map((row) => row.id);
    };
    // The course already had one module; new ones are added after it.
    expect(await order()).toEqual([catalogue.modules.draft, first.id, second.id]);
    expect(await moveModule(trainer.client, second.id, "up")).toBe(true);
    expect(await order()).toEqual([catalogue.modules.draft, second.id, first.id]);
    expect(await moveModule(trainer.client, catalogue.modules.draft, "up")).toBe(false);

    expect(
      await updateModule(trainer.client, first.id, {
        title: { pt: "Planificar aulas", en: "Planning lessons" },
        description: none,
      }),
    ).toEqual({ ok: true, id: first.id });
    const { data: row } = await admin().from("modules").select("*").eq("id", first.id).single();
    expect(row).toMatchObject({
      title_pt: "Planificar aulas",
      title_en: "Planning lessons",
      description_en: null,
    });

    const untitled = { title: { pt: " ", en: "" }, description: none };
    expect(await createModule(trainer.client, catalogue.courses.draft, untitled)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await createModule(trainer.client, randomUUID(), {
        title: { pt: "Sem curso", en: "" },
        description: none,
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await createModule(learner.client, catalogue.courses.published, {
        title: { pt: "Não", en: "" },
        description: none,
      }),
    ).toEqual({ ok: false, reason: "failed" });
  });

  test("a video, a Google document, a link and a text page", async () => {
    const video = await createMaterial(trainer.client, moduleId, {
      kind: "video",
      url: "  https://youtu.be/aqz-KE-bpKQ?t=90 ",
      ...details("Vídeo", { contentLanguage: "en" }),
    });
    const slides = await createMaterial(trainer.client, moduleId, {
      kind: "embed",
      url: "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit#slide=id.p",
      ...details("Diapositivos"),
    });
    const link = await createMaterial(trainer.client, moduleId, {
      kind: "link",
      url: "http://example.org/guia de estudo",
      ...details("Ligação"),
    });
    const page = await createMaterial(trainer.client, moduleId, {
      kind: "page",
      body: { pt: "    código no início\r\n\r\nTexto.   \n\n", en: "" },
      ...details("Página", { isPublished: true }),
    });
    for (const result of [video, slides, link, page]) expect(result.ok).toBe(true);
    if (!video.ok || !slides.ok || !link.ok || !page.ok) return;

    expect(await materialRow(video.id)).toMatchObject({
      kind: "video",
      url: "https://youtu.be/aqz-KE-bpKQ?t=90",
      content_language: "en",
      is_published: false,
      title_pt: "Vídeo",
      title_en: null,
    });
    expect((await materialRow(slides.id)).url).toBe(
      "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit#slide=id.p",
    );
    expect((await materialRow(link.id)).url).toBe("http://example.org/guia%20de%20estudo");
    expect(await materialRow(page.id)).toMatchObject({
      kind: "page",
      body_pt: "    código no início\n\nTexto.",
      body_en: null,
      is_published: true,
    });
    expect(await materialOrder(moduleId)).toEqual([video.id, slides.id, link.id, page.id]);

    // Order, visibility, editing.
    expect(await moveMaterial(trainer.client, page.id, "up")).toBe(true);
    expect(await materialOrder(moduleId)).toEqual([video.id, slides.id, page.id, link.id]);
    expect(await moveMaterial(trainer.client, video.id, "up")).toBe(false);

    expect(await setMaterialPublished(trainer.client, video.id, true)).toBe(true);
    expect(await setMaterialPublished(learner.client, video.id, false)).toBe(false);
    expect((await materialRow(video.id)).is_published).toBe(true);

    expect(
      await updateMaterial(trainer.client, link.id, {
        kind: "link",
        url: "https://example.org/novo",
        ...details("Ligação", { title: { pt: "Ligação", en: "Link" } }),
      }),
    ).toEqual({ ok: true, id: link.id });
    expect(await materialRow(link.id)).toMatchObject({
      url: "https://example.org/novo",
      title_en: "Link",
    });

    // A material keeps its kind.
    expect(
      await updateMaterial(trainer.client, page.id, {
        kind: "link",
        url: "https://example.org/",
        ...details("Página"),
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect((await materialRow(page.id)).kind).toBe("page");

    // The remaining hidden materials of the module become visible in one go.
    expect(await publishModuleMaterials(learner.client, moduleId)).toBe(0);
    expect(await publishModuleMaterials(trainer.client, secondModuleId)).toBe(0);
    expect(await publishModuleMaterials(trainer.client, moduleId)).toBe(2);
    expect((await materialRow(slides.id)).is_published).toBe(true);

    // Moving to another module of the course, but never to another course.
    expect(await moveMaterialToModule(trainer.client, page.id, secondModuleId)).toBe(true);
    expect((await materialRow(page.id)).module_id).toBe(secondModuleId);
    expect(await moveMaterialToModule(trainer.client, page.id, catalogue.modules.other)).toBe(
      false,
    );
    expect((await materialRow(page.id)).module_id).toBe(secondModuleId);

    expect(await deleteMaterial(trainer.client, link.id)).toBe("deleted");
    expect(await deleteMaterial(trainer.client, link.id)).toBe("not_found");
    expect(await deleteMaterial(learner.client, video.id)).toBe("not_found");
  });

  test("addresses the platform cannot show are refused, as are empty materials", async () => {
    const attempts = [
      {
        kind: "video",
        url: "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs/edit",
      },
      { kind: "video", url: "https://youtube.com.example.org/watch?v=aqz-KE-bpKQ" },
      { kind: "video", url: "http://youtu.be/aqz-KE-bpKQ" },
      { kind: "embed", url: "https://youtu.be/aqz-KE-bpKQ" },
      { kind: "embed", url: "https://docs.google.com.example.org/presentation/d/abc/edit" },
      { kind: "link", url: "javascript:alert(1)" },
      { kind: "link", url: "nada" },
    ] as const;
    for (const attempt of attempts) {
      expect(
        await createMaterial(trainer.client, moduleId, { ...attempt, ...details("Mau") }),
      ).toEqual({ ok: false, reason: "url" });
    }

    expect(
      await createMaterial(trainer.client, moduleId, {
        kind: "page",
        body: { pt: "  \n ", en: "" },
        ...details("Vazia"),
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await createMaterial(trainer.client, moduleId, {
        kind: "link",
        url: "https://example.org/",
        ...details("  "),
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await createMaterial(trainer.client, randomUUID(), {
        kind: "link",
        url: "https://example.org/",
        ...details("Sem módulo"),
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await createMaterial(learner.client, catalogue.modules.published, {
        kind: "link",
        url: "https://example.org/",
        ...details("Não"),
      }),
    ).toEqual({ ok: false, reason: "failed" });
  });

  test("uploads: where to put a file, replacing it, and clearing what was left behind", async () => {
    expect(
      await prepareUpload(trainer.client, { moduleId, fileName: "virus.exe", sizeBytes: 10 }),
    ).toEqual({ ok: false, reason: "type" });
    expect(
      await prepareUpload(trainer.client, { moduleId, fileName: "vazio.pdf", sizeBytes: 0 }),
    ).toEqual({ ok: false, reason: "empty" });
    expect(
      await prepareUpload(trainer.client, {
        moduleId,
        fileName: "enorme.pdf",
        sizeBytes: 60 * 1024 * 1024,
      }),
    ).toEqual({ ok: false, reason: "tooLarge" });
    expect(
      await prepareUpload(trainer.client, {
        moduleId: randomUUID(),
        fileName: "a.pdf",
        sizeBytes: 10,
      }),
    ).toEqual({ ok: false, reason: "not_found" });

    const prepared = await prepareUpload(trainer.client, {
      moduleId,
      fileName: "Sessão 1.PDF",
      sizeBytes: pdf.byteLength,
    });
    expect(prepared).toMatchObject({ ok: true, contentType: "application/pdf" });
    if (!prepared.ok) return;
    expect(prepared.storagePath).toMatch(
      new RegExp(`^${catalogue.courses.draft}/[0-9a-f-]{36}\\.pdf$`),
    );

    // Someone who is not a trainer gets no location and no token, even for a course they follow.
    expect(
      await prepareUpload(learner.client, {
        moduleId: catalogue.modules.published,
        fileName: "a.pdf",
        sizeBytes: 10,
      }),
    ).toEqual({ ok: false, reason: "not_found" });

    // The token is good for that one location only.
    const elsewhere = await trainer.client.storage
      .from(BUCKET)
      .uploadToSignedUrl(
        `${catalogue.courses.draft}/${randomUUID()}.pdf`,
        prepared.uploadToken,
        pdf,
        { contentType: prepared.contentType },
      );
    expect(elsewhere.error).not.toBeNull();

    // The browser uploads to exactly that location; then the material is recorded.
    const first = await trainer.client.storage
      .from(BUCKET)
      .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, pdf, {
        contentType: prepared.contentType,
      });
    expect(first.error).toBeNull();
    const created = await createFileMaterial(trainer.client, {
      moduleId,
      storagePath: prepared.storagePath,
      originalName: "Sessão 1.PDF",
      ...details("Sessão 1"),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(
      await updateFileDetails(
        trainer.client,
        created.id,
        details("Sessão 1", { isPublished: true, contentLanguage: "pt" }),
      ),
    ).toEqual({ ok: true, id: created.id });
    expect(await materialRow(created.id)).toMatchObject({
      is_published: true,
      content_language: "pt",
      file_name: "Sessão 1.PDF",
    });

    // Replace the file: the material stays, the old file goes.
    const replacement = await uploadTo(catalogue.courses.draft);
    expect(
      await replaceMaterialFile(trainer.client, created.id, {
        storagePath: replacement,
        originalName: "Sessão 1 (corrigida).pdf",
      }),
    ).toEqual({ ok: true, id: created.id });
    expect(await materialRow(created.id)).toMatchObject({
      storage_path: replacement,
      file_name: "Sessão 1 (corrigida).pdf",
      is_published: true,
      title_pt: "Sessão 1",
    });
    expect(await objectExists(prepared.storagePath)).toBe(false);
    expect(await objectExists(replacement)).toBe(true);

    // Another material's file cannot be taken, a file from another course neither.
    const second = await uploadTo(catalogue.courses.draft);
    const secondMaterial = await createFileMaterial(trainer.client, {
      moduleId,
      storagePath: second,
      originalName: "outro.pdf",
      ...details("Outro"),
    });
    expect(secondMaterial.ok).toBe(true);
    expect(
      await replaceMaterialFile(trainer.client, created.id, {
        storagePath: second,
        originalName: "outro.pdf",
      }),
    ).toEqual({ ok: false, reason: "path" });
    const foreign = await uploadTo(catalogue.courses.other);
    expect(
      await replaceMaterialFile(trainer.client, created.id, {
        storagePath: foreign,
        originalName: "x.pdf",
      }),
    ).toEqual({ ok: false, reason: "path" });
    expect(await objectExists(second)).toBe(true);
    expect(await objectExists(foreign)).toBe(true);
    expect(
      await replaceMaterialFile(learner.client, created.id, {
        storagePath: foreign,
        originalName: "x.pdf",
      }),
    ).toEqual({ ok: false, reason: "not_found" });

    // An upload whose form was never saved is cleared, but only once it is old.
    const abandoned = await uploadTo(catalogue.courses.draft);
    expect(await removeAbandonedUploads(trainer.client, catalogue.courses.draft)).toBe(0);
    expect(await objectExists(abandoned)).toBe(true);
    expect(await removeAbandonedUploads(learner.client, catalogue.courses.draft, -1000)).toBe(0);
    expect(await removeAbandonedUploads(trainer.client, catalogue.courses.draft, -1000)).toBe(1);
    expect(await objectExists(abandoned)).toBe(false);
    expect(await objectExists(replacement)).toBe(true);
    expect(await objectExists(second)).toBe(true);

    // Deleting the module removes its materials and their files.
    expect(await deleteModule(learner.client, moduleId)).toBe("not_found");
    expect(await deleteModule(trainer.client, moduleId)).toBe("deleted");
    expect(await objectExists(replacement)).toBe(false);
    expect(await objectExists(second)).toBe(false);
    expect(await deleteModule(trainer.client, moduleId)).toBe("not_found");

    await admin().storage.from(BUCKET).remove([foreign]);
  });
});

describe("enrolments", () => {
  const coursesOf = async (userId: string) => {
    const { data } = await admin()
      .from("enrollments")
      .select("course_id, created_by")
      .eq("user_id", userId);
    return (data ?? []).map((row) => row.course_id).sort();
  };

  test("adding people to a course counts only the new ones", async () => {
    const course = catalogue.courses.unlisted;
    expect(
      await enrollUsers(trainer.client, course, [learner.id, other.id, learner.id], trainer.id),
    ).toEqual({ ok: true, added: 2 });
    expect(await enrollUsers(trainer.client, course, [learner.id], trainer.id)).toEqual({
      ok: true,
      added: 0,
    });
    expect(await enrollUsers(trainer.client, course, [], trainer.id)).toEqual({
      ok: true,
      added: 0,
    });
    expect(await enrollUsers(trainer.client, course, [randomUUID()], trainer.id)).toEqual({
      ok: false,
      added: 0,
    });

    expect(await unenrollUser(trainer.client, course, other.id)).toBe(true);
    expect(await unenrollUser(trainer.client, course, other.id)).toBe(false);
    expect(await coursesOf(other.id)).toEqual([]);
  });

  test("a person's courses can be set as one list", async () => {
    const { published, other: second, unlisted } = catalogue.courses;
    expect(await setUserCourses(trainer.client, learner.id, [published, second], trainer.id)).toBe(
      true,
    );
    expect(await coursesOf(learner.id)).toEqual([published, second].sort());
    expect(await setUserCourses(trainer.client, learner.id, [unlisted], trainer.id)).toBe(true);
    expect(await coursesOf(learner.id)).toEqual([unlisted]);
    expect(await setUserCourses(trainer.client, learner.id, [], trainer.id)).toBe(true);
    expect(await coursesOf(learner.id)).toEqual([]);
  });

  test("learners cannot enrol anyone, themselves included", async () => {
    const course = catalogue.courses.published;
    expect(await enrollUsers(learner.client, course, [learner.id], learner.id)).toEqual({
      ok: false,
      added: 0,
    });
    expect(await setUserCourses(learner.client, learner.id, [course], learner.id)).toBe(false);
    expect(await coursesOf(learner.id)).toEqual([]);

    await enrollUsers(trainer.client, course, [other.id], trainer.id);
    expect(await unenrollUser(learner.client, course, other.id)).toBe(false);
    expect(await coursesOf(other.id)).toEqual([course]);
  });
});

describe("roles and personal details", () => {
  const roleOf = async (id: string) =>
    (await admin().from("profiles").select("role").eq("id", id).single()).data?.role;

  test("a trainer promotes and demotes others, but not themselves", async () => {
    expect(await setUserRole(trainer.client, trainer.id, other.id, "trainer")).toBe("ok");
    expect(await roleOf(other.id)).toBe("trainer");
    expect(await setUserRole(trainer.client, trainer.id, other.id, "learner")).toBe("ok");
    expect(await roleOf(other.id)).toBe("learner");

    expect(await setUserRole(trainer.client, trainer.id, trainer.id, "learner")).toBe("self");
    expect(await roleOf(trainer.id)).toBe("trainer");
    expect(await setUserRole(trainer.client, trainer.id, randomUUID(), "trainer")).toBe(
      "not_found",
    );
    expect(await setUserRole(trainer.client, trainer.id, "nope", "trainer")).toBe("not_found");
  });

  test("a learner cannot give anyone a role", async () => {
    expect(await setUserRole(learner.client, learner.id, learner.id, "trainer")).toBe("failed");
    expect(await setUserRole(learner.client, trainer.id, learner.id, "trainer")).toBe("failed");
    expect(await roleOf(learner.id)).toBe("learner");
  });

  test("the database's refusal to demote the last trainer is reported as such", async () => {
    const refusing = {
      rpc: async () => ({ error: { code: "P0001", hint: "last_trainer", message: "" } }),
    } as unknown as Client;
    expect(await setUserRole(refusing, trainer.id, other.id, "learner")).toBe("last_trainer");
  });

  test("a changed language reaches the person's emails", async () => {
    expect(
      await updateProfile(trainer.client, learner.id, { fullName: "  Lena Novo ", locale: "en" }),
    ).toBe(true);
    const { data: profile } = await admin()
      .from("profiles")
      .select("full_name, locale")
      .eq("id", learner.id)
      .single();
    expect(profile).toEqual({ full_name: "Lena Novo", locale: "en" });

    const { data: account } = await admin().auth.admin.getUserById(learner.id);
    expect(account.user?.user_metadata).toMatchObject({ full_name: "Lena Novo", locale: "en" });

    await visitor().auth.resetPasswordForEmail(learner.email);
    expect(await subjectsSentTo(learner.email)).toEqual(["Set a new password for AI Training"]);

    // People change their own details; nobody else's.
    expect(
      await updateProfile(learner.client, learner.id, { fullName: "Lena", locale: "pt" }),
    ).toBe(true);
    expect(
      await updateProfile(learner.client, other.id, { fullName: "Hacked", locale: "en" }),
    ).toBe(false);
    const { data: again } = await admin().auth.admin.getUserById(learner.id);
    expect(again.user?.user_metadata).toMatchObject({ full_name: "Lena", locale: "pt" });
    const { data: untouched } = await admin().auth.admin.getUserById(other.id);
    expect(untouched.user?.user_metadata.full_name).not.toBe("Hacked");
  });

  test("changing a password needs the current one", async () => {
    const person = await createUser("learner", "bo-password");
    const next = "Outra-palavra-passe-456";
    const canSignIn = async (password: string) =>
      (await visitor().auth.signInWithPassword({ email: person.email, password })).error === null;

    try {
      expect(
        await changePassword(person.client, visitor(), {
          email: person.email,
          current: "errada-errada-1",
          next,
        }),
      ).toBe("wrong_password");
      expect(await canSignIn(PASSWORD)).toBe(true);

      expect(
        await changePassword(person.client, visitor(), {
          email: person.email,
          current: PASSWORD,
          next: "curta",
        }),
      ).toBe("weak");
      expect(
        await changePassword(person.client, visitor(), {
          email: person.email,
          current: PASSWORD,
          next: PASSWORD,
        }),
      ).toBe("same_password");

      expect(
        await changePassword(person.client, visitor(), {
          email: person.email,
          current: PASSWORD,
          next,
        }),
      ).toBe("ok");
      expect(await canSignIn(next)).toBe(true);
      expect(await canSignIn(PASSWORD)).toBe(false);
      // The session that asked for the change still works.
      expect((await person.client.auth.getUser()).data.user?.id).toBe(person.id);
    } finally {
      await deleteUsers([person]);
    }
  });
});

describe("handling information requests", () => {
  const send = async (label: string, courseId?: string) => {
    const email = `bo-request-${label}-${runId}@example.test`;
    expect(
      await submitInfoRequest(admin(), {
        name: "Rita Pedido",
        email,
        organisation: "Hospital Exemplo",
        message: "Gostava de saber mais.",
        locale: "en",
        courseId,
      }),
    ).toBe("stored");
    const { data } = await admin().from("info_requests").select("id").eq("email", email).single();
    return { id: data!.id, email };
  };
  const requestRow = async (id: string) =>
    (await admin().from("info_requests").select("*").eq("id", id).maybeSingle()).data;

  test("status changes record who handled the request", async () => {
    const request = await send("status");
    expect(await setRequestStatus(trainer.client, request.id, "contacted", trainer.id)).toBe(true);
    const handled = await requestRow(request.id);
    expect(handled).toMatchObject({ status: "contacted", handled_by: trainer.id });
    expect(handled?.handled_at).not.toBeNull();

    expect(await setRequestStatus(trainer.client, request.id, "new", trainer.id)).toBe(true);
    expect(await requestRow(request.id)).toMatchObject({
      status: "new",
      handled_by: null,
      handled_at: null,
    });

    expect(await setRequestStatus(learner.client, request.id, "archived", learner.id)).toBe(false);
    expect(await deleteRequest(learner.client, request.id)).toBe(false);
    expect((await requestRow(request.id))?.status).toBe("new");

    expect(await deleteRequest(trainer.client, request.id)).toBe(true);
    expect(await requestRow(request.id)).toBeNull();
    expect(await deleteRequest(trainer.client, request.id)).toBe(false);
  });

  test("a request becomes an invitation with the person's name, language and courses", async () => {
    const request = await send("invite", catalogue.courses.published);
    const result = await inviteFromRequest(admin(), trainer.client, {
      requestId: request.id,
      courseIds: [catalogue.courses.published],
      mode: "link",
      invitedBy: trainer.id,
    });
    expect(result).toMatchObject({ email: request.email, outcome: "invited", emailSent: false });
    expect(result?.link).toContain("/en/auth/confirm?token_hash=");

    const { data: profile } = await admin()
      .from("profiles")
      .select("id, full_name, locale, role, email_confirmed_at")
      .eq("email", request.email)
      .single();
    expect(profile).toMatchObject({
      full_name: "Rita Pedido",
      locale: "en",
      role: "learner",
      email_confirmed_at: null,
    });
    const { data: enrolments } = await admin()
      .from("enrollments")
      .select("course_id")
      .eq("user_id", profile!.id);
    expect(enrolments).toEqual([{ course_id: catalogue.courses.published }]);
    expect(await requestRow(request.id)).toMatchObject({
      status: "invited",
      handled_by: trainer.id,
    });
  });

  test("only a trainer can turn a request into an invitation", async () => {
    const request = await send("refused");
    expect(
      await inviteFromRequest(admin(), learner.client, {
        requestId: request.id,
        courseIds: [],
        mode: "link",
        invitedBy: learner.id,
      }),
    ).toBeNull();
    expect(
      await inviteFromRequest(admin(), trainer.client, {
        requestId: randomUUID(),
        courseIds: [],
        mode: "link",
        invitedBy: trainer.id,
      }),
    ).toBeNull();
    expect((await requestRow(request.id))?.status).toBe("new");
    const { data: account } = await admin()
      .from("profiles")
      .select("id")
      .eq("email", request.email)
      .maybeSingle();
    expect(account).toBeNull();
  });
});
