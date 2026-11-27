import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { submitInfoRequest } from "@/features/requests/operations";
import {
  fetchCourseBuilder,
  fetchCourseLearners,
  fetchCourseOptions,
  fetchDashboard,
  fetchEditableMaterial,
  fetchPeopleNotEnrolled,
  fetchTrainerAreas,
  fetchTrainerCourse,
  fetchTrainerCourses,
  fetchTrainerLevels,
  fetchTrainerRequests,
  fetchTrainerUser,
  fetchTrainerUsers,
} from "@/lib/dal/trainer-queries";
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
  type Catalogue,
  type TestUser,
} from "./helpers";

let catalogue: Catalogue;
let trainer: TestUser;
let enrolled: TestUser;
let outsider: TestUser;
let pendingId: string;
const pendingEmail = `tq-pending-${runId}@example.test`;
const requestEmail = `tq-request-${runId}@example.test`;
let videoId: string;

beforeAll(async () => {
  await ensureKeeperTrainer();
  const service = admin();
  catalogue = await createCatalogue();
  trainer = await createUser("trainer", "tq-trainer");
  enrolled = await createUser("learner", "tq-enrolled");
  outsider = await createUser("learner", "tq-outsider");
  await enroll(enrolled.id, [catalogue.courses.published, catalogue.courses.unlisted]);

  const invited = await service.auth.admin.generateLink({
    type: "invite",
    email: pendingEmail,
    options: { data: { full_name: "Paula Pendente", locale: "en" } },
  });
  pendingId = invited.data.user!.id;
  await enroll(pendingId, [catalogue.courses.published]);

  // A description in one language only, and a video next to the two pages.
  await service
    .from("courses")
    .update({ description_pt: "Descrição só em português" })
    .eq("id", catalogue.courses.published);
  const { data: video } = await service
    .from("materials")
    .insert({
      module_id: catalogue.modules.published,
      kind: "video",
      title_pt: "Vídeo",
      title_en: "Video",
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      is_published: true,
      sort_order: 99,
    })
    .select("id")
    .single();
  videoId = video!.id;

  for (const [email, courseId] of [
    [enrolled.email, catalogue.courses.published],
    [requestEmail, undefined],
  ] as const) {
    await submitInfoRequest(service, {
      name: "Pessoa Interessada",
      email,
      message: "Olá",
      locale: "pt",
      courseId,
    });
  }
});

afterAll(async () => {
  const service = admin();
  await service.from("info_requests").delete().in("email", [enrolled.email, requestEmail]);
  await service.auth.admin.deleteUser(pendingId);
  await deleteCatalogue(catalogue);
  await deleteUsers([enrolled, outsider, trainer]);
});

describe("catalogue lists", () => {
  test("areas come with both languages and their number of courses", async () => {
    const areas = await fetchTrainerAreas(trainer.client);
    expect(areas.find((area) => area.id === catalogue.areaId)).toEqual({
      id: catalogue.areaId,
      slug: `area-${runId}`,
      name: { pt: `Área ${runId}`, en: `Area ${runId}` },
      description: { pt: "", en: "" },
      color: "forest",
      icon: "shapes",
      courseCount: 4, // drafts and unlisted courses count too
    });
  });

  test("levels run from the first step to the last", async () => {
    const levels = await fetchTrainerLevels(trainer.client);
    const introductory = levels.find((level) => level.slug === "introductory");
    expect(introductory).toMatchObject({
      name: { pt: "Iniciação", en: "Introductory" },
      step: 1,
    });
    expect(introductory!.courseCount).toBeGreaterThanOrEqual(4);
    expect(levels.at(-1)?.step).toBe(3);
  });

  test("the course list shows every status, learner counts and missing translations", async () => {
    const courses = await fetchTrainerCourses(trainer.client, "en");
    const ours = new Map(
      courses.filter((course) => course.slug.endsWith(runId)).map((course) => [course.id, course]),
    );
    expect(ours.size).toBe(4);

    expect(ours.get(catalogue.courses.published)).toMatchObject({
      status: "published",
      title: `Course published ${runId}`,
      gaps: ["en"], // the description exists in Portuguese only
      area: { id: catalogue.areaId, name: `Area ${runId}`, color: "forest" },
      level: { name: "Introductory", step: 1 },
      learnerCount: 2,
    });
    expect(ours.get(catalogue.courses.draft)).toMatchObject({
      status: "draft",
      gaps: [],
      learnerCount: 0,
    });
    expect(ours.get(catalogue.courses.unlisted)).toMatchObject({
      status: "unlisted",
      learnerCount: 1,
    });

    const options = await fetchCourseOptions(trainer.client, "pt");
    expect(options.find((option) => option.id === catalogue.courses.draft)).toEqual({
      id: catalogue.courses.draft,
      status: "draft",
      title: `Curso draft ${runId}`,
      areaName: `Área ${runId}`,
      // Every course has at least the edition it was created with.
      editions: [
        {
          id: await defaultEdition(catalogue.courses.draft),
          name: "Edição geral",
          startsOn: null,
          endsOn: null,
          isDefault: true,
        },
      ],
    });
  });

  test("one course, with everything its form edits", async () => {
    expect(await fetchTrainerCourse(trainer.client, catalogue.courses.published)).toMatchObject({
      id: catalogue.courses.published,
      slug: `course-published-${runId}`,
      status: "published",
      areaId: catalogue.areaId,
      levelId: catalogue.levelId,
      title: { pt: `Curso published ${runId}`, en: `Course published ${runId}` },
      summary: { pt: "Resumo", en: "Summary" },
      description: { pt: "Descrição só em português", en: "" },
      durationHours: null,
      learnerCount: 2,
    });
    expect(await fetchTrainerCourse(trainer.client, randomUUID())).toBeNull();
    expect(await fetchTrainerCourse(trainer.client, "not-an-id")).toBeNull();
  });
});

describe("course content", () => {
  test("the builder lists hidden materials too, in order, with what is left to translate", async () => {
    const modules = await fetchCourseBuilder(trainer.client, catalogue.courses.published);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      id: catalogue.modules.published,
      title: { pt: "Módulo published", en: "" },
      gaps: ["en"],
    });
    expect(modules[0].materials.map((material) => material.id)).toEqual([
      catalogue.materials.visible,
      catalogue.materials.hidden,
      videoId,
    ]);

    const [page, hidden, video] = modules[0].materials;
    expect(page).toMatchObject({ kind: "page", isPublished: true, gaps: ["en"], embed: null });
    expect(hidden.isPublished).toBe(false);
    expect(video).toMatchObject({
      kind: "video",
      title: { pt: "Vídeo", en: "Video" },
      gaps: [],
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      embed: {
        provider: "youtube",
        embedUrl: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0",
      },
      file: null,
    });

    expect(await fetchCourseBuilder(trainer.client, "not-an-id")).toEqual([]);
  });

  test("one material, with its text, for the edit form", async () => {
    expect(await fetchEditableMaterial(trainer.client, catalogue.materials.visible)).toMatchObject({
      id: catalogue.materials.visible,
      moduleId: catalogue.modules.published,
      courseId: catalogue.courses.published,
      kind: "page",
      body: { pt: "Conteúdo", en: "" },
    });
    expect(await fetchEditableMaterial(trainer.client, randomUUID())).toBeNull();
    expect(await fetchEditableMaterial(trainer.client, "nope")).toBeNull();
  });
});

describe("people", () => {
  test("a course's learners, and who could still be added", async () => {
    const learners = await fetchCourseLearners(trainer.client, catalogue.courses.published);
    expect(learners.map((person) => person.id).sort()).toEqual([enrolled.id, pendingId].sort());
    expect(learners.find((person) => person.id === pendingId)).toMatchObject({
      email: pendingEmail,
      fullName: "Paula Pendente",
      isPending: true,
      role: "learner",
    });
    expect(learners.find((person) => person.id === enrolled.id)?.isPending).toBe(false);

    const candidates = await fetchPeopleNotEnrolled(trainer.client, catalogue.courses.published);
    const ids = candidates.map((person) => person.id);
    expect(ids).toContain(outsider.id);
    expect(ids).not.toContain(enrolled.id);
    expect(ids).not.toContain(pendingId);
    expect(ids).not.toContain(trainer.id); // trainers already see every course
  });

  test("the user list shows role, invitation state and number of courses", async () => {
    const users = await fetchTrainerUsers(trainer.client);
    const byId = new Map(users.map((user) => [user.id, user]));
    expect(byId.get(enrolled.id)).toMatchObject({
      email: enrolled.email,
      role: "learner",
      isPending: false,
      courseCount: 2,
      locale: "pt",
    });
    expect(byId.get(pendingId)).toMatchObject({ isPending: true, courseCount: 1, locale: "en" });
    expect(byId.get(trainer.id)).toMatchObject({ role: "trainer", courseCount: 0 });

    const one = await fetchTrainerUser(trainer.client, enrolled.id);
    expect(one?.courseIds.sort()).toEqual(
      [catalogue.courses.published, catalogue.courses.unlisted].sort(),
    );
    expect(await fetchTrainerUser(trainer.client, randomUUID())).toBeNull();
    expect(await fetchTrainerUser(trainer.client, "nope")).toBeNull();
  });
});

describe("information requests and the dashboard", () => {
  test("requests show the course asked about and whether the person already has an account", async () => {
    const requests = await fetchTrainerRequests(trainer.client, "en");
    const known = requests.find((request) => request.email === enrolled.email);
    const unknown = requests.find((request) => request.email === requestEmail);

    expect(known).toMatchObject({
      name: "Pessoa Interessada",
      message: "Olá",
      organisation: "",
      status: "new",
      locale: "pt",
      course: { id: catalogue.courses.published, title: `Course published ${runId}` },
      account: { id: enrolled.id, isPending: false },
    });
    expect(unknown).toMatchObject({ course: null, account: null });

    await admin().from("info_requests").update({ status: "archived" }).eq("email", requestEmail);
    const stillNew = await fetchTrainerRequests(trainer.client, "en", { status: "new" });
    expect(stillNew.some((request) => request.email === requestEmail)).toBe(false);
    expect(stillNew.some((request) => request.email === enrolled.email)).toBe(true);
    const archived = await fetchTrainerRequests(trainer.client, "en", { status: "archived" });
    expect(archived.some((request) => request.email === requestEmail)).toBe(true);
  });

  test("the dashboard counts courses, learners, pending invitations and new requests", async () => {
    // Counted independently, with the secret key, to compare with what a trainer is shown.
    const countCourses = async (status: "draft" | "published" | "unlisted") => {
      const { count } = await admin()
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return count ?? 0;
    };

    const dashboard = await fetchDashboard(trainer.client, "pt");
    expect(dashboard.courses).toEqual({
      draft: await countCourses("draft"),
      published: await countCourses("published"),
      unlisted: await countCourses("unlisted"),
    });
    expect(dashboard.courses.published).toBeGreaterThanOrEqual(2);
    expect(dashboard.activeLearners).toBeGreaterThanOrEqual(2);
    expect(dashboard.pendingInvitations).toBeGreaterThanOrEqual(1);
    expect(dashboard.newRequests).toBeGreaterThanOrEqual(1);

    expect(dashboard.pendingPeople.length).toBeLessThanOrEqual(5);
    expect(dashboard.pendingPeople[0]).toMatchObject({ id: pendingId, isPending: true });
    expect(dashboard.latestRequests.length).toBeLessThanOrEqual(5);
    expect(dashboard.latestRequests.every((request) => request.status === "new")).toBe(true);
    expect(dashboard.latestRequests.some((request) => request.email === enrolled.email)).toBe(true);
  });
});

describe("the same queries with a learner's session", () => {
  test("show nothing beyond what that learner may see anyway", async () => {
    const client = outsider.client;

    expect(await fetchTrainerCourse(client, catalogue.courses.draft)).toBeNull();
    const courses = await fetchTrainerCourses(client, "pt");
    expect(courses.some((course) => course.status !== "published")).toBe(false);
    expect(courses.every((course) => course.learnerCount === 0)).toBe(true);

    expect(await fetchCourseBuilder(client, catalogue.courses.published)).toEqual([]);
    expect(await fetchEditableMaterial(client, catalogue.materials.visible)).toBeNull();
    expect(await fetchCourseLearners(client, catalogue.courses.published)).toEqual([]);

    expect((await fetchTrainerUsers(client)).map((user) => user.id)).toEqual([outsider.id]);
    expect(await fetchTrainerUser(client, enrolled.id)).toBeNull();
    expect(await fetchPeopleNotEnrolled(client, catalogue.courses.published)).toEqual([
      expect.objectContaining({ id: outsider.id }),
    ]);

    expect(await fetchTrainerRequests(client, "pt")).toEqual([]);
    const dashboard = await fetchDashboard(client, "pt");
    expect(dashboard).toMatchObject({
      pendingInvitations: 0,
      newRequests: 0,
      latestRequests: [],
      pendingPeople: [],
    });
    expect(dashboard.courses.draft + dashboard.courses.unlisted).toBe(0);
  });
});
