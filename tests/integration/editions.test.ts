import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createEdition,
  deleteEdition,
  makeDefaultEdition,
  setHiddenInEdition,
  updateEdition,
  type EditionInput,
} from "@/features/editions/operations";
import { enrollUsers, moveLearner, setUserCourses } from "@/features/enrollments/operations";
import {
  createFileMaterial,
  createMaterial,
  updateMaterial,
} from "@/features/materials/operations";
import { inviteUsers } from "@/features/users/operations";
import { fetchPublishedCourse } from "@/lib/dal/catalog-queries";
import { fetchCourseContent, fetchMaterialPage } from "@/lib/dal/learner-queries";
import {
  fetchCourseBuilder,
  fetchCourseEditions,
  fetchCourseLearners,
  fetchCourseOptions,
  fetchTrainerUser,
} from "@/lib/dal/trainer-queries";
import { buildSamplePdf } from "../fixtures/sample-pdf";
import {
  admin,
  BUCKET,
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
 * Editions: the runs of a course. The published course of the catalogue gets four of them,
 * and its one module gets materials for all, for one, and hidden in one.
 *
 *   general   the edition the course was created with (default; Ana is in it)
 *   january   public, dated far ahead (Bea is in it); hides "shared2", has "januaryOnly"
 *   school    not public, no dates, nobody in it
 *   past      public, long over
 */

const pdf = buildSamplePdf(1, "Editions test");
const none = { pt: "", en: "" };
const slug = `course-published-${runId}`;
const invitedEmail = `ed-invited-${runId}@example.test`;

let catalogue: Catalogue;
let trainer: TestUser;
let ana: TestUser;
let bea: TestUser;
let outsider: TestUser;

let published: string;
let general: string;
let january: string;
let school: string;
let past: string;
let shared2: string;
let januaryOnly: string;
let generalOnly: string;

const sorted = (ids: string[]) => [...ids].sort();
const idsOf = (rows: Array<{ id: string }> | null) => sorted((rows ?? []).map((row) => row.id));
const asLearner = (user: TestUser) => ({ id: user.id, role: "learner" as const });
const asTrainer = (user: TestUser) => ({ id: user.id, role: "trainer" as const });

/** The materials of the published course's module that a client can read. */
async function seenMaterials(client: Client): Promise<string[]> {
  const { data, error } = await client
    .from("materials")
    .select("id")
    .eq("module_id", catalogue.modules.published);
  if (error) throw new Error(`materials: ${error.code} ${error.message}`);
  return idsOf(data);
}

/** The editions of the catalogue's courses that a client can read. */
async function seenEditions(client: Client): Promise<string[]> {
  const { data, error } = await client
    .from("editions")
    .select("id")
    .in("course_id", Object.values(catalogue.courses));
  if (error) throw new Error(`editions: ${error.code} ${error.message}`);
  return idsOf(data);
}

async function editionOf(userId: string, courseId: string): Promise<string | undefined> {
  const { data } = await admin()
    .from("enrollments")
    .select("edition_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  return data?.edition_id;
}

async function hiddenRows(materialId: string): Promise<number> {
  const { data } = await admin()
    .from("edition_hidden_materials")
    .select("edition_id")
    .eq("material_id", materialId);
  return data?.length ?? 0;
}

const page = (title: string) => ({
  kind: "page" as const,
  title: { pt: title, en: "" },
  description: none,
  body: { pt: "Texto", en: "" },
  contentLanguage: null,
  isPublished: true,
});

beforeAll(async () => {
  await ensureKeeperTrainer();
  const service = admin();
  catalogue = await createCatalogue();
  published = catalogue.courses.published;
  trainer = await createUser("trainer", "ed-trainer");
  ana = await createUser("learner", "ed-ana");
  bea = await createUser("learner", "ed-bea");
  outsider = await createUser("learner", "ed-outsider");

  general = await defaultEdition(published);
  const editions = await service
    .from("editions")
    .insert([
      {
        course_id: published,
        name_pt: "Janeiro",
        name_en: "January",
        starts_on: "2099-01-10",
        ends_on: "2099-02-10",
        is_listed: true,
      },
      {
        course_id: published,
        name_pt: "Escola",
        name_en: "School",
        starts_on: null,
        ends_on: null,
        is_listed: false,
      },
      {
        course_id: published,
        name_pt: "Passada",
        name_en: "Past",
        starts_on: "2001-03-01",
        ends_on: "2001-03-31",
        is_listed: true,
      },
    ])
    .select("id, name_en");
  if (editions.error) throw new Error(`Editions failed: ${editions.error.message}`);
  const editionId = (name: string) => editions.data.find((row) => row.name_en === name)!.id;
  january = editionId("January");
  school = editionId("School");
  past = editionId("Past");

  const material = (title_pt: string, edition_id: string | null, sort_order: number) => ({
    module_id: catalogue.modules.published,
    kind: "page" as const,
    title_pt,
    body_pt: "Texto",
    is_published: true,
    edition_id,
    sort_order,
  });
  const materials = await service
    .from("materials")
    .insert([
      material("Partilhada 2", null, 30),
      material("Só janeiro", january, 40),
      material("Só geral", general, 50),
    ])
    .select("id, title_pt");
  if (materials.error) throw new Error(`Materials failed: ${materials.error.message}`);
  const materialId = (title: string) => materials.data.find((row) => row.title_pt === title)!.id;
  shared2 = materialId("Partilhada 2");
  januaryOnly = materialId("Só janeiro");
  generalOnly = materialId("Só geral");

  const hide = await service
    .from("edition_hidden_materials")
    .insert({ edition_id: january, material_id: shared2 });
  if (hide.error) throw new Error(`Hiding failed: ${hide.error.message}`);

  await enroll(ana.id, [published]);
  await enroll(bea.id, [published], { [published]: january });
});

afterAll(async () => {
  const service = admin();
  const { data: invited } = await service
    .from("profiles")
    .select("id")
    .eq("email", invitedEmail)
    .maybeSingle();
  if (invited) await service.auth.admin.deleteUser(invited.id);
  await deleteCatalogue(catalogue);
  await deleteUsers([trainer, ana, bea, outsider]);
});

describe("editions: what the database allows", () => {
  test("every course starts with one edition, which is its default", async () => {
    for (const courseId of Object.values(catalogue.courses)) {
      const { data } = await admin()
        .from("editions")
        .select("name_pt, name_en")
        .eq("course_id", courseId)
        .eq("is_default", true);
      expect(data).toEqual([{ name_pt: "Edição geral", name_en: "General edition" }]);
    }
  });

  test("a visitor sees the listed editions of published courses, and nothing else", async () => {
    // A listed edition of a course that is not on the public site stays out of sight.
    const elsewhere = await admin().from("editions").insert({
      course_id: catalogue.courses.unlisted,
      name_pt: "Listada",
      name_en: "Listed",
      starts_on: "2099-05-01",
      is_listed: true,
    });
    expect(elsewhere.error).toBeNull();

    expect(await seenEditions(visitor())).toEqual(sorted([january, past]));

    const hiddenList = await visitor().from("edition_hidden_materials").select("edition_id");
    expect(hiddenList.error?.code).toBe("42501");
    const insert = await visitor()
      .from("editions")
      .insert({ course_id: published, name_pt: "x", name_en: "x" });
    expect(insert.error?.code).toBe("42501");
  });

  test("a learner also sees the edition they are in; a trainer sees them all", async () => {
    expect(await seenEditions(outsider.client)).toEqual(sorted([january, past]));
    // Ana's own edition is not public. "School" is nobody's business but the trainers'.
    expect(await seenEditions(ana.client)).toEqual(sorted([general, january, past]));
    expect(await seenEditions(bea.client)).toEqual(sorted([january, past]));

    const all = await trainer.client.from("editions").select("id").eq("course_id", published);
    expect(idsOf(all.data)).toEqual(sorted([general, january, school, past]));
  });

  test("a learner cannot create, change or delete an edition, nor move themselves", async () => {
    const insert = await ana.client
      .from("editions")
      .insert({ course_id: published, name_pt: "Minha", name_en: "Mine" });
    expect(insert.error?.code).toBe("42501");

    const rename = await ana.client
      .from("editions")
      .update({ name_pt: "Outra" })
      .eq("id", general)
      .select("id");
    expect(rename.data).toEqual([]);

    const remove = await ana.client.from("editions").delete().eq("id", school).select("id");
    expect(remove.data).toEqual([]);

    const move = await ana.client
      .from("enrollments")
      .update({ edition_id: january })
      .eq("user_id", ana.id)
      .select("user_id");
    expect(move.data ?? []).toEqual([]);
    expect(await editionOf(ana.id, published)).toBe(general);

    // What an edition hides is for trainers only: nothing to read, nothing to write.
    const read = await ana.client.from("edition_hidden_materials").select("edition_id");
    expect(read.data).toEqual([]);
    const hide = await ana.client
      .from("edition_hidden_materials")
      .insert({ edition_id: general, material_id: catalogue.materials.visible });
    expect(hide.error?.code).toBe("42501");
  });

  test("the rules even a trainer cannot break", async () => {
    // An edition never changes course: the column is not writable at all.
    const changeCourse = await trainer.client
      .from("editions")
      .update({ course_id: catalogue.courses.other })
      .eq("id", school);
    expect(changeCourse.error?.code).toBe("42501");

    const listUndated = await trainer.client
      .from("editions")
      .update({ is_listed: true })
      .eq("id", school);
    expect(listUndated.error?.code).toBe("23514");

    const endFirst = await trainer.client
      .from("editions")
      .update({ starts_on: "2099-05-02", ends_on: "2099-05-01" })
      .eq("id", school);
    expect(endFirst.error?.code).toBe("23514");

    // A material takes an edition of its own course only.
    const elsewhere = await trainer.client
      .from("materials")
      .update({ edition_id: january })
      .eq("id", catalogue.materials.other);
    expect(elsewhere.error?.code).toBe("23514");

    // Only a material every edition shares can be hidden in one of them.
    const hideOwn = await trainer.client
      .from("edition_hidden_materials")
      .insert({ edition_id: school, material_id: januaryOnly });
    expect(hideOwn.error?.code).toBe("23514");

    // An enrolment names an edition of its own course.
    const wrongEdition = await trainer.client
      .from("enrollments")
      .insert({ user_id: outsider.id, course_id: catalogue.courses.other, edition_id: january });
    expect(wrongEdition.error?.code).toBe("23503");
  });

  test("an enrolment that names no edition lands in the course's default one", async () => {
    // The application always names one; this is the database's own safety net.
    const row = { user_id: outsider.id, course_id: catalogue.courses.other } as {
      user_id: string;
      course_id: string;
      edition_id: string;
    };
    const { error } = await admin().from("enrollments").insert(row);
    expect(error).toBeNull();
    expect(await editionOf(outsider.id, catalogue.courses.other)).toBe(
      await defaultEdition(catalogue.courses.other),
    );
    await admin().from("enrollments").delete().eq("user_id", outsider.id);
  });
});

describe("editions: what trainers do with them", () => {
  const march: EditionInput = {
    name: { pt: " Março ", en: "March" },
    startsOn: "2099-03-01",
    endsOn: "2099-03-20",
    isListed: false,
  };

  const defaults = async () => {
    const { data } = await admin()
      .from("editions")
      .select("id")
      .eq("course_id", published)
      .eq("is_default", true);
    return idsOf(data);
  };

  test("create, edit, make default and delete", async () => {
    const created = await createEdition(trainer.client, published, march);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { data: row } = await admin()
      .from("editions")
      .select("name_pt, name_en, starts_on, ends_on, is_listed, is_default")
      .eq("id", created.id)
      .single();
    expect(row).toEqual({
      name_pt: "Março",
      name_en: "March",
      starts_on: "2099-03-01",
      ends_on: "2099-03-20",
      is_listed: false,
      is_default: false,
    });

    expect(
      await updateEdition(trainer.client, created.id, { ...march, endsOn: null, isListed: true }),
    ).toEqual({ ok: true, id: created.id });
    // Public without a first day, and ending before it starts: refused by the database too.
    expect(
      await updateEdition(trainer.client, created.id, {
        ...march,
        startsOn: null,
        endsOn: null,
        isListed: true,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await createEdition(trainer.client, published, {
        ...march,
        startsOn: "2099-03-02",
        endsOn: "2099-03-01",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(await createEdition(trainer.client, randomUUID(), march)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await updateEdition(trainer.client, randomUUID(), march)).toEqual({
      ok: false,
      reason: "not_found",
    });

    // The default moves, and there is never more than one.
    expect(await makeDefaultEdition(trainer.client, created.id)).toBe(true);
    expect(await defaults()).toEqual([created.id]);
    expect(await makeDefaultEdition(trainer.client, general)).toBe(true);
    expect(await defaults()).toEqual([general]);
    expect(await makeDefaultEdition(trainer.client, randomUUID())).toBe(false);

    expect(await deleteEdition(trainer.client, created.id)).toBe("deleted");
    expect(await deleteEdition(trainer.client, created.id)).toBe("not_found");
  });

  test("an edition with learners is kept, and so is a course's last edition", async () => {
    expect(await deleteEdition(trainer.client, january)).toBe("has_learners");
    expect(await deleteEdition(trainer.client, await defaultEdition(catalogue.courses.other))).toBe(
      "last_edition",
    );
    expect(await seenEditions(trainer.client)).toContain(january);
  });

  test("deleting an edition takes its own materials, and their files, with it", async () => {
    const created = await createEdition(trainer.client, published, march);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const path = `${published}/${randomUUID()}.pdf`;
    const upload = await trainer.client.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf" });
    expect(upload.error).toBeNull();
    const file = await createFileMaterial(trainer.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "marco.pdf",
      title: { pt: "Ficheiro de março", en: "" },
      description: none,
      contentLanguage: null,
      isPublished: true,
      editionId: created.id,
    });
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    expect(await deleteEdition(trainer.client, created.id)).toBe("deleted");
    const { data: left } = await admin().from("materials").select("id").eq("id", file.id);
    expect(left).toEqual([]);
    const gone = await admin().storage.from(BUCKET).download(path);
    expect(gone.error).not.toBeNull();
  });

  test("one of the course's materials can be hidden in an edition, and shown again", async () => {
    const visible = catalogue.materials.visible;
    expect(await setHiddenInEdition(trainer.client, school, visible, true)).toBe(true);
    // Asking twice changes nothing.
    expect(await setHiddenInEdition(trainer.client, school, visible, true)).toBe(true);
    expect(await hiddenRows(visible)).toBe(1);

    // Not for a material of one edition, nor for one of another course.
    expect(await setHiddenInEdition(trainer.client, school, januaryOnly, true)).toBe(false);
    expect(await setHiddenInEdition(trainer.client, school, catalogue.materials.other, true)).toBe(
      false,
    );
    // Not by a learner.
    expect(await setHiddenInEdition(ana.client, general, shared2, true)).toBe(false);
    expect(await setHiddenInEdition(trainer.client, "nope", visible, true)).toBe(false);

    expect(await setHiddenInEdition(trainer.client, school, visible, false)).toBe(true);
    expect(await hiddenRows(visible)).toBe(0);
  });

  test("people join the edition named, or the default one, and can be moved", async () => {
    expect(await enrollUsers(trainer.client, published, [outsider.id], trainer.id, school)).toEqual(
      { ok: true, added: 1 },
    );
    expect(await editionOf(outsider.id, published)).toBe(school);

    // Someone already in the course is left where they are.
    expect(
      await enrollUsers(trainer.client, published, [outsider.id], trainer.id, january),
    ).toEqual({ ok: true, added: 0 });
    expect(await editionOf(outsider.id, published)).toBe(school);

    expect(await moveLearner(trainer.client, published, outsider.id, january)).toBe(true);
    expect(await editionOf(outsider.id, published)).toBe(january);
    // Already there; an edition of another course; a learner moving themselves.
    expect(await moveLearner(trainer.client, published, outsider.id, january)).toBe(false);
    expect(
      await moveLearner(
        trainer.client,
        published,
        outsider.id,
        await defaultEdition(catalogue.courses.other),
      ),
    ).toBe(false);
    expect(await moveLearner(outsider.client, published, outsider.id, school)).toBe(false);
    expect(await editionOf(outsider.id, published)).toBe(january);

    // No edition named: the default one. An edition of another course: nobody is added.
    expect(
      await enrollUsers(trainer.client, catalogue.courses.unlisted, [outsider.id], trainer.id),
    ).toEqual({ ok: true, added: 1 });
    expect(await editionOf(outsider.id, catalogue.courses.unlisted)).toBe(
      await defaultEdition(catalogue.courses.unlisted),
    );
    expect(
      await enrollUsers(trainer.client, catalogue.courses.other, [outsider.id], trainer.id, school),
    ).toEqual({ ok: false, added: 0 });

    await admin().from("enrollments").delete().eq("user_id", outsider.id);
  });

  test("a person's courses can be set together with their editions", async () => {
    const other = catalogue.courses.other;
    expect(
      await setUserCourses(
        trainer.client,
        outsider.id,
        [{ courseId: published, editionId: january }, other],
        trainer.id,
      ),
    ).toBe(true);
    expect(await editionOf(outsider.id, published)).toBe(january);
    expect(await editionOf(outsider.id, other)).toBe(await defaultEdition(other));

    // Naming another edition moves the person; naming none leaves them where they are.
    expect(
      await setUserCourses(
        trainer.client,
        outsider.id,
        [{ courseId: published, editionId: school }, { courseId: other }],
        trainer.id,
      ),
    ).toBe(true);
    expect(await editionOf(outsider.id, published)).toBe(school);
    expect(await editionOf(outsider.id, other)).toBe(await defaultEdition(other));

    expect(await setUserCourses(trainer.client, outsider.id, [published], trainer.id)).toBe(true);
    expect(await editionOf(outsider.id, published)).toBe(school);
    expect(await editionOf(outsider.id, other)).toBeUndefined();

    expect(await setUserCourses(trainer.client, outsider.id, [], trainer.id)).toBe(true);
    expect(await editionOf(outsider.id, published)).toBeUndefined();
  });

  test("an invitation can name the edition of each course", async () => {
    const other = catalogue.courses.other;
    const [result] = await inviteUsers(admin(), trainer.client, {
      emails: [invitedEmail],
      locale: "pt",
      role: "learner",
      courseIds: [published, other],
      editionIds: { [published]: january },
      mode: "link",
      invitedBy: trainer.id,
    });
    expect(result.outcome).toBe("invited");

    const { data: invited } = await admin()
      .from("profiles")
      .select("id")
      .eq("email", invitedEmail)
      .single();
    expect(await editionOf(invited!.id, published)).toBe(january);
    expect(await editionOf(invited!.id, other)).toBe(await defaultEdition(other));
    // So that the counts below are only Ana's and Bea's.
    await admin().from("enrollments").delete().eq("user_id", invited!.id);
  });
});

describe("editions: what each learner sees", () => {
  test("the course's materials their edition shows, and the edition's own", async () => {
    const visible = catalogue.materials.visible;
    expect(await seenMaterials(ana.client)).toEqual(sorted([visible, shared2, generalOnly]));
    // January hides "shared2" and has a material of its own.
    expect(await seenMaterials(bea.client)).toEqual(sorted([visible, januaryOnly]));
    expect(await seenMaterials(outsider.client)).toEqual([]);
  });

  test("the learner area names the edition, with its dates, and keeps to it", async () => {
    const forAna = await fetchCourseContent(ana.client, asLearner(ana), slug, "en");
    expect(forAna?.edition).toEqual({
      id: general,
      name: "General edition",
      startsOn: null,
      endsOn: null,
    });
    expect(forAna?.editions).toEqual([]);

    const forBea = await fetchCourseContent(bea.client, asLearner(bea), slug, "pt");
    expect(forBea?.edition).toEqual({
      id: january,
      name: "Janeiro",
      startsOn: "2099-01-10",
      endsOn: "2099-02-10",
    });
    expect(forBea?.modules[0].materials.map((material) => material.id)).toEqual([
      catalogue.materials.visible,
      januaryOnly,
    ]);
    expect(forBea?.modules[0].materials[1].editionId).toBe(january);

    // Asking for another edition's view gets a learner nowhere.
    const asked = await fetchCourseContent(bea.client, asLearner(bea), slug, "pt", {
      editionId: general,
    });
    expect(asked?.edition?.id).toBe(january);
    expect(asked?.modules[0].materials.map((material) => material.id)).toEqual([
      catalogue.materials.visible,
      januaryOnly,
    ]);
    expect(await fetchMaterialPage(bea.client, asLearner(bea), slug, generalOnly, "pt")).toBeNull();
    expect(
      (await fetchMaterialPage(bea.client, asLearner(bea), slug, januaryOnly, "pt"))?.edition?.id,
    ).toBe(january);
  });

  test("a trainer sees the whole course, or on request what one edition gets", async () => {
    const whole = await fetchCourseContent(trainer.client, asTrainer(trainer), slug, "pt");
    expect(whole?.edition).toBeNull();
    // Undated ones first, oldest first; then by first day.
    expect(whole?.editions.map((edition) => edition.id)).toEqual([general, school, past, january]);
    const everything = whole?.modules[0].materials ?? [];
    expect(sorted(everything.map((material) => material.id))).toEqual(
      sorted([
        catalogue.materials.visible,
        catalogue.materials.hidden,
        shared2,
        januaryOnly,
        generalOnly,
      ]),
    );
    expect(everything.find((material) => material.id === januaryOnly)?.editionId).toBe(january);
    expect(everything.find((material) => material.id === shared2)?.editionId).toBeNull();

    for (const [editionId, learner] of [
      [january, bea],
      [general, ana],
    ] as const) {
      const preview = await fetchCourseContent(trainer.client, asTrainer(trainer), slug, "pt", {
        editionId,
      });
      expect(preview?.edition?.id).toBe(editionId);
      const previewed = preview?.modules[0].materials ?? [];
      // Exactly what the edition's learners get, plus what is still hidden from everyone.
      expect(
        sorted(previewed.filter((material) => material.isPublished).map((material) => material.id)),
      ).toEqual(await seenMaterials(learner.client));
      expect(
        previewed.filter((material) => !material.isPublished).map((material) => material.id),
      ).toEqual([catalogue.materials.hidden]);
    }

    // The material of another edition has no page in January's view; an unknown edition is
    // simply the whole course.
    expect(
      await fetchMaterialPage(trainer.client, asTrainer(trainer), slug, generalOnly, "pt", {
        editionId: january,
      }),
    ).toBeNull();
    const unknown = await fetchCourseContent(trainer.client, asTrainer(trainer), slug, "pt", {
      editionId: randomUUID(),
    });
    expect(unknown?.edition).toBeNull();
    expect(unknown?.modules[0].materials).toHaveLength(everything.length);
  });

  test("moving a learner changes what they see at once", async () => {
    expect(await moveLearner(trainer.client, published, bea.id, general)).toBe(true);
    expect(await seenMaterials(bea.client)).toEqual(await seenMaterials(ana.client));
    expect(await moveLearner(trainer.client, published, bea.id, january)).toBe(true);
    expect(await seenMaterials(bea.client)).toEqual(
      sorted([catalogue.materials.visible, januaryOnly]),
    );
  });

  test("a material can be given to one edition, and back to all of them", async () => {
    // "shared2" is hidden in January. Made January's own, it shows there and nowhere else,
    // and the note that hid it is gone.
    expect(
      await updateMaterial(trainer.client, shared2, {
        ...page("Partilhada 2"),
        editionId: january,
      }),
    ).toEqual({ ok: true, id: shared2 });
    expect(await seenMaterials(bea.client)).toContain(shared2);
    expect(await seenMaterials(ana.client)).not.toContain(shared2);
    expect(await hiddenRows(shared2)).toBe(0);

    // A save that does not mention the edition leaves it as it is.
    expect(await updateMaterial(trainer.client, shared2, page("Partilhada 2"))).toEqual({
      ok: true,
      id: shared2,
    });
    expect(await seenMaterials(ana.client)).not.toContain(shared2);

    expect(
      await updateMaterial(trainer.client, shared2, { ...page("Partilhada 2"), editionId: null }),
    ).toEqual({ ok: true, id: shared2 });
    expect(await seenMaterials(ana.client)).toContain(shared2);

    // An edition of another course is refused.
    expect(
      await createMaterial(trainer.client, catalogue.modules.other, {
        ...page("Fora do sítio"),
        editionId: january,
      }),
    ).toEqual({ ok: false, reason: "invalid" });

    // As it was, for the tests below.
    expect(await setHiddenInEdition(trainer.client, january, shared2, true)).toBe(true);
  });

  test("a file of one edition can only be opened by that edition's learners", async () => {
    const path = `${published}/${randomUUID()}.pdf`;
    const upload = await trainer.client.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf" });
    expect(upload.error).toBeNull();
    const file = await createFileMaterial(trainer.client, {
      moduleId: catalogue.modules.published,
      storagePath: path,
      originalName: "janeiro.pdf",
      title: { pt: "Ficheiro de janeiro", en: "" },
      description: none,
      contentLanguage: null,
      isPublished: true,
      editionId: january,
    });
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    const forBea = await bea.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(forBea.error).toBeNull();
    const forAna = await ana.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(forAna.data).toBeNull();
    expect(forAna.error).not.toBeNull();

    await admin().from("materials").delete().eq("id", file.id);
  });
});

describe("editions in the back-office", () => {
  test("a course's editions, in order, with what each one holds", async () => {
    const editions = await fetchCourseEditions(trainer.client, published);
    expect(editions.map((edition) => edition.id)).toEqual([general, school, past, january]);
    expect(editions.find((edition) => edition.id === january)).toEqual({
      id: january,
      name: { pt: "Janeiro", en: "January" },
      startsOn: "2099-01-10",
      endsOn: "2099-02-10",
      isListed: true,
      isDefault: false,
      learnerCount: 1,
      ownMaterials: 1,
      hiddenMaterials: 1,
    });
    expect(editions.find((edition) => edition.id === general)).toMatchObject({
      isListed: false,
      isDefault: true,
      learnerCount: 1,
      ownMaterials: 1,
      hiddenMaterials: 0,
    });
    expect(editions.find((edition) => edition.id === school)).toMatchObject({
      startsOn: null,
      learnerCount: 0,
      ownMaterials: 0,
      hiddenMaterials: 0,
    });
    expect(await fetchCourseEditions(trainer.client, "not-an-id")).toEqual([]);
  });

  test("courses, learners and materials each say which edition they belong to", async () => {
    const options = await fetchCourseOptions(trainer.client, "en");
    expect(options.find((option) => option.id === published)?.editions).toEqual([
      { id: general, name: "General edition", startsOn: null, endsOn: null, isDefault: true },
      { id: school, name: "School", startsOn: null, endsOn: null, isDefault: false },
      {
        id: past,
        name: "Past",
        startsOn: "2001-03-01",
        endsOn: "2001-03-31",
        isDefault: false,
      },
      {
        id: january,
        name: "January",
        startsOn: "2099-01-10",
        endsOn: "2099-02-10",
        isDefault: false,
      },
    ]);

    const learners = await fetchCourseLearners(trainer.client, published);
    expect(Object.fromEntries(learners.map((person) => [person.id, person.editionId]))).toEqual({
      [ana.id]: general,
      [bea.id]: january,
    });

    const [module] = await fetchCourseBuilder(trainer.client, published);
    const byId = new Map(module.materials.map((material) => [material.id, material]));
    expect(byId.get(shared2)).toMatchObject({ editionId: null, hiddenIn: [january] });
    expect(byId.get(januaryOnly)).toMatchObject({ editionId: january, hiddenIn: [] });
    expect(byId.get(catalogue.materials.visible)).toMatchObject({ editionId: null, hiddenIn: [] });

    expect((await fetchTrainerUser(trainer.client, bea.id))?.editionByCourse).toEqual({
      [published]: january,
    });
  });

  test("with a learner's session the same queries show no more than they may see", async () => {
    const editions = await fetchCourseEditions(ana.client, published);
    expect(sorted(editions.map((edition) => edition.id))).toEqual(sorted([general, january, past]));
    expect(editions.every((edition) => edition.hiddenMaterials === 0)).toBe(true);
    expect(await fetchCourseBuilder(ana.client, published)).toEqual([]);
  });
});

describe("editions on the public course page", () => {
  test("the coming editions a trainer marked as public, soonest first", async () => {
    const before = await fetchPublishedCourse(visitor(), slug, "pt", "2098-12-31");
    expect(before?.upcomingEditions).toEqual([
      { id: january, name: "Janeiro", startsOn: "2099-01-10", endsOn: "2099-02-10" },
    ]);

    // The first day still counts as coming; the day after, the edition has started.
    const firstDay = await fetchPublishedCourse(visitor(), slug, "en", "2099-01-10");
    expect(firstDay?.upcomingEditions.map((edition) => edition.name)).toEqual(["January"]);
    const dayAfter = await fetchPublishedCourse(visitor(), slug, "pt", "2099-01-11");
    expect(dayAfter?.upcomingEditions).toEqual([]);

    // Today: 2099 is still ahead, 2001 is long over.
    const now = await fetchPublishedCourse(visitor(), slug, "pt");
    expect(now?.upcomingEditions.map((edition) => edition.id)).toEqual([january]);

    // A trainer's client reads every edition, and still gets the public ones only.
    const forTrainer = await fetchPublishedCourse(trainer.client, slug, "pt", "2000-01-01");
    expect(forTrainer?.upcomingEditions.map((edition) => edition.id)).toEqual([past, january]);
  });
});
