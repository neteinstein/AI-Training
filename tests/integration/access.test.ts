import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  admin,
  createCatalogue,
  createUser,
  deleteCatalogue,
  deleteUsers,
  enroll,
  ensureKeeperTrainer,
  visitor,
  type Catalogue,
  type Client,
  type TestUser,
} from "./helpers";

let catalogue: Catalogue;
let enrolled: TestUser;
let outsider: TestUser;
let trainer: TestUser;

beforeAll(async () => {
  await ensureKeeperTrainer();
  catalogue = await createCatalogue();
  enrolled = await createUser("learner", "enrolled");
  outsider = await createUser("learner", "outsider");
  trainer = await createUser("trainer", "trainer");
  // Enrolled in one published course, the draft and the unlisted one; not in "other".
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

async function visibleIds(
  client: Client,
  table: "courses" | "modules" | "materials",
  ids: string[],
): Promise<string[]> {
  const { data, error } = await client.from(table).select("id").in("id", ids);
  if (error) throw new Error(`${table}: ${error.code} ${error.message}`);
  return (data ?? []).map((row) => row.id).sort();
}

const sorted = (ids: string[]) => [...ids].sort();

describe("catalogue", () => {
  test("a visitor sees published courses only", async () => {
    const ids = await visibleIds(visitor(), "courses", Object.values(catalogue.courses));
    expect(ids).toEqual(sorted([catalogue.courses.published, catalogue.courses.other]));
  });

  test("a visitor cannot read modules or materials at all", async () => {
    const modules = await visitor().from("modules").select("id");
    expect(modules.error?.code).toBe("42501");
    const materials = await visitor().from("materials").select("id");
    expect(materials.error?.code).toBe("42501");
  });

  test("a visitor cannot change the catalogue", async () => {
    const insert = await visitor()
      .from("areas")
      .insert({ slug: "intruder", name_pt: "x", name_en: "x" });
    expect(insert.error?.code).toBe("42501");

    const update = await visitor()
      .from("courses")
      .update({ title_pt: "Hacked" })
      .eq("id", catalogue.courses.published);
    expect(update.error?.code).toBe("42501");
  });

  test("a learner sees published courses plus unlisted ones they are enrolled in", async () => {
    const all = Object.values(catalogue.courses);
    expect(await visibleIds(outsider.client, "courses", all)).toEqual(
      sorted([catalogue.courses.published, catalogue.courses.other]),
    );
    expect(await visibleIds(enrolled.client, "courses", all)).toEqual(
      sorted([catalogue.courses.published, catalogue.courses.other, catalogue.courses.unlisted]),
    );
  });

  test("a learner cannot change the catalogue", async () => {
    const insert = await enrolled.client.from("courses").insert({
      slug: "intruder-course",
      area_id: catalogue.areaId,
      level_id: catalogue.levelId,
      title_pt: "x",
      title_en: "x",
    });
    expect(insert.error?.code).toBe("42501");

    const update = await enrolled.client
      .from("courses")
      .update({ title_pt: "Hacked" })
      .eq("id", catalogue.courses.published)
      .select("id");
    expect(update.data).toEqual([]);

    const remove = await enrolled.client
      .from("areas")
      .delete()
      .eq("id", catalogue.areaId)
      .select("id");
    expect(remove.data).toEqual([]);
  });

  test("a trainer sees every course, including drafts", async () => {
    const all = Object.values(catalogue.courses);
    expect(await visibleIds(trainer.client, "courses", all)).toEqual(sorted(all));
  });

  test("a course cannot leave draft without both summaries", async () => {
    const { data: draft, error } = await trainer.client
      .from("courses")
      .insert({
        slug: `no-summary-${catalogue.areaId.slice(0, 8)}`,
        area_id: catalogue.areaId,
        level_id: catalogue.levelId,
        title_pt: "Sem resumo",
        title_en: "No summary",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const publish = await trainer.client
      .from("courses")
      .update({ status: "published", summary_pt: "Só em português" })
      .eq("id", draft!.id);
    expect(publish.error?.code).toBe("23514");

    await trainer.client.from("courses").delete().eq("id", draft!.id);
  });
});

describe("course content", () => {
  test("an enrolled learner sees the modules of courses they may open", async () => {
    const ids = await visibleIds(enrolled.client, "modules", Object.values(catalogue.modules));
    // Not "other" (not enrolled) and not "draft" (enrolled, but the course is a draft).
    expect(ids).toEqual(sorted([catalogue.modules.published, catalogue.modules.unlisted]));
  });

  test("an enrolled learner sees published materials only", async () => {
    const ids = await visibleIds(enrolled.client, "materials", Object.values(catalogue.materials));
    expect(ids).toEqual(sorted([catalogue.materials.visible, catalogue.materials.unlisted]));
  });

  test("a learner who is not enrolled sees no content", async () => {
    expect(await visibleIds(outsider.client, "modules", Object.values(catalogue.modules))).toEqual(
      [],
    );
    expect(
      await visibleIds(outsider.client, "materials", Object.values(catalogue.materials)),
    ).toEqual([]);
  });

  test("a trainer sees all content, hidden materials included", async () => {
    const all = Object.values(catalogue.materials);
    expect(await visibleIds(trainer.client, "materials", all)).toEqual(sorted(all));
  });

  test("a learner cannot change content", async () => {
    const insert = await enrolled.client
      .from("modules")
      .insert({ course_id: catalogue.courses.published, title_pt: "Intruso" });
    expect(insert.error?.code).toBe("42501");

    const publish = await enrolled.client
      .from("materials")
      .update({ is_published: true })
      .eq("id", catalogue.materials.hidden)
      .select("id");
    expect(publish.data).toEqual([]);

    const remove = await enrolled.client
      .from("materials")
      .delete()
      .eq("id", catalogue.materials.visible)
      .select("id");
    expect(remove.data).toEqual([]);
  });

  test("a material must match its kind and only frame allow-listed hosts", async () => {
    const base = { module_id: catalogue.modules.published, title_pt: "Teste" };

    const fileWithoutObject = await trainer.client
      .from("materials")
      .insert({ ...base, kind: "file" });
    expect(fileWithoutObject.error?.code).toBe("23514");

    const videoElsewhere = await trainer.client
      .from("materials")
      .insert({ ...base, kind: "video", url: "https://youtube.com.example.org/watch?v=abc" });
    expect(videoElsewhere.error?.code).toBe("23514");

    const embedElsewhere = await trainer.client
      .from("materials")
      .insert({ ...base, kind: "embed", url: "https://example.org/docs.google.com/x" });
    expect(embedElsewhere.error?.code).toBe("23514");

    const scriptLink = await trainer.client
      .from("materials")
      .insert({ ...base, kind: "link", url: "javascript:alert(1)" });
    expect(scriptLink.error?.code).toBe("23514");

    const goodEmbed = await trainer.client
      .from("materials")
      .insert({
        ...base,
        kind: "embed",
        url: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
      })
      .select("id")
      .single();
    expect(goodEmbed.error).toBeNull();
    await trainer.client.from("materials").delete().eq("id", goodEmbed.data!.id);
  });

  test("a trainer can reorder modules; a learner's attempt changes nothing", async () => {
    const { data: second } = await trainer.client
      .from("modules")
      .insert({ course_id: catalogue.courses.published, title_pt: "Segundo", sort_order: 99 })
      .select("id")
      .single();
    const order = [second!.id, catalogue.modules.published];

    const refused = await enrolled.client.rpc("reorder_modules", {
      target_course_id: catalogue.courses.published,
      ordered_ids: order,
    });
    expect(refused.error).toBeNull(); // runs, but row level security lets it touch nothing
    const before = await admin().from("modules").select("id, sort_order").in("id", order);
    expect(before.data?.find((m) => m.id === second!.id)?.sort_order).toBe(99);

    const applied = await trainer.client.rpc("reorder_modules", {
      target_course_id: catalogue.courses.published,
      ordered_ids: order,
    });
    expect(applied.error).toBeNull();
    const after = await admin()
      .from("modules")
      .select("id")
      .eq("course_id", catalogue.courses.published)
      .order("sort_order");
    expect(after.data?.map((m) => m.id)).toEqual(order);

    await trainer.client.from("modules").delete().eq("id", second!.id);
  });
});

describe("enrolments", () => {
  test("a learner sees only their own enrolments", async () => {
    const mine = await enrolled.client.from("enrollments").select("user_id, course_id");
    expect(mine.data).toHaveLength(3);
    expect(mine.data?.every((row) => row.user_id === enrolled.id)).toBe(true);

    const none = await outsider.client.from("enrollments").select("user_id");
    expect(none.data).toEqual([]);
  });

  test("a learner cannot enrol themselves or drop an enrolment", async () => {
    const selfEnrol = await outsider.client
      .from("enrollments")
      .insert({ user_id: outsider.id, course_id: catalogue.courses.published });
    expect(selfEnrol.error?.code).toBe("42501");

    const drop = await enrolled.client
      .from("enrollments")
      .delete()
      .eq("user_id", enrolled.id)
      .select("course_id");
    expect(drop.data).toEqual([]);
  });

  test("a course with learners cannot be deleted", async () => {
    const { error } = await trainer.client
      .from("courses")
      .delete()
      .eq("id", catalogue.courses.published);
    expect(error?.code).toBe("23503");
  });

  test("removing an enrolment ends access at once", async () => {
    const removal = await trainer.client
      .from("enrollments")
      .delete()
      .eq("user_id", enrolled.id)
      .eq("course_id", catalogue.courses.unlisted);
    expect(removal.error).toBeNull();

    expect(await visibleIds(enrolled.client, "courses", [catalogue.courses.unlisted])).toEqual([]);
    expect(await visibleIds(enrolled.client, "materials", [catalogue.materials.unlisted])).toEqual(
      [],
    );
  });
});
