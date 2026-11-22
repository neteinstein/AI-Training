import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;
export type TestUser = { id: string; email: string; client: Client };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/** Secret-key client: bypasses RLS. Used to arrange and clean up test data. */
export const admin = (): Client => createClient<Database>(url, secretKey, options);

/** Publishable-key client with no session: what an anonymous visitor gets. */
export const visitor = (): Client => createClient<Database>(url, publishableKey, options);

/** Unique per test file run, so parallel or repeated runs never collide. */
export const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const PASSWORD = "Integration-test-123";
export const BUCKET = "course-materials";

const KEEPER_EMAIL = "integration-keeper@example.test";

/**
 * The database refuses to remove its last trainer. A permanent "keeper" trainer lets the
 * suites delete the trainers they create without tripping that rule.
 */
export async function ensureKeeperTrainer(): Promise<void> {
  const service = admin();
  const { data: existing } = await service
    .from("profiles")
    .select("id, role")
    .eq("email", KEEPER_EMAIL)
    .maybeSingle();

  let id = existing?.id;
  if (!id) {
    const { data, error } = await service.auth.admin.createUser({
      email: KEEPER_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Integration keeper" },
    });
    if (error || !data.user) throw new Error(`Could not create keeper trainer: ${error?.message}`);
    id = data.user.id;
  }
  if (existing?.role !== "trainer") {
    const { error } = await service.from("profiles").update({ role: "trainer" }).eq("id", id);
    if (error) throw new Error(`Could not promote keeper trainer: ${error.message}`);
  }
}

export async function createUser(
  role: "learner" | "trainer",
  label: string,
  metadata: Record<string, unknown> = {},
): Promise<TestUser> {
  const service = admin();
  const email = `${label}-${runId}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: label, ...metadata },
  });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);

  if (role === "trainer") {
    const { error: roleError } = await service
      .from("profiles")
      .update({ role: "trainer" })
      .eq("id", data.user.id);
    if (roleError) throw new Error(`Promoting ${label} failed: ${roleError.message}`);
  }

  const client = visitor();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`Sign-in for ${label} failed: ${signInError.message}`);

  return { id: data.user.id, email, client };
}

export async function deleteUsers(users: Array<TestUser | undefined>): Promise<void> {
  const service = admin();
  for (const user of users) {
    if (!user) continue;
    await service.auth.admin.deleteUser(user.id);
  }
}

export type Catalogue = {
  areaId: string;
  levelId: string;
  courses: { published: string; other: string; draft: string; unlisted: string };
  modules: { published: string; other: string; draft: string; unlisted: string };
  materials: {
    visible: string;
    hidden: string;
    other: string;
    draft: string;
    unlisted: string;
  };
};

/**
 * One area with four courses (two published, one draft, one unlisted), each with a module and
 * a published page; the first course also has a hidden page.
 */
export async function createCatalogue(): Promise<Catalogue> {
  const service = admin();

  const { data: level, error: levelError } = await service
    .from("levels")
    .select("id")
    .eq("slug", "introductory")
    .single();
  if (levelError || !level) throw new Error(`No introductory level: ${levelError?.message}`);

  const { data: area, error: areaError } = await service
    .from("areas")
    .insert({ slug: `area-${runId}`, name_pt: `Área ${runId}`, name_en: `Area ${runId}` })
    .select("id")
    .single();
  if (areaError || !area) throw new Error(`Area insert failed: ${areaError?.message}`);

  const statuses = {
    published: "published",
    other: "published",
    draft: "draft",
    unlisted: "unlisted",
  } as const;

  const courses = {} as Catalogue["courses"];
  const modules = {} as Catalogue["modules"];
  const materials = {} as Catalogue["materials"];

  for (const key of Object.keys(statuses) as Array<keyof typeof statuses>) {
    const { data: course, error: courseError } = await service
      .from("courses")
      .insert({
        slug: `course-${key}-${runId}`,
        area_id: area.id,
        level_id: level.id,
        status: statuses[key],
        title_pt: `Curso ${key} ${runId}`,
        title_en: `Course ${key} ${runId}`,
        summary_pt: "Resumo",
        summary_en: "Summary",
      })
      .select("id")
      .single();
    if (courseError || !course) throw new Error(`Course ${key} failed: ${courseError?.message}`);
    courses[key] = course.id;

    const { data: module, error: moduleError } = await service
      .from("modules")
      .insert({ course_id: course.id, title_pt: `Módulo ${key}` })
      .select("id")
      .single();
    if (moduleError || !module) throw new Error(`Module ${key} failed: ${moduleError?.message}`);
    modules[key] = module.id;

    const { data: material, error: materialError } = await service
      .from("materials")
      .insert({
        module_id: module.id,
        kind: "page",
        title_pt: `Página ${key}`,
        body_pt: "Conteúdo",
        is_published: true,
      })
      .select("id")
      .single();
    if (materialError || !material) {
      throw new Error(`Material ${key} failed: ${materialError?.message}`);
    }
    if (key === "published") materials.visible = material.id;
    else materials[key] = material.id;
  }

  const { data: hidden, error: hiddenError } = await service
    .from("materials")
    .insert({
      module_id: modules.published,
      kind: "page",
      title_pt: "Página oculta",
      body_pt: "Rascunho",
      is_published: false,
    })
    .select("id")
    .single();
  if (hiddenError || !hidden) throw new Error(`Hidden material failed: ${hiddenError?.message}`);
  materials.hidden = hidden.id;

  return { areaId: area.id, levelId: level.id, courses, modules, materials };
}

export async function enroll(userId: string, courseIds: string[]): Promise<void> {
  const { error } = await admin()
    .from("enrollments")
    .insert(courseIds.map((course_id) => ({ user_id: userId, course_id })));
  if (error) throw new Error(`Enrolment failed: ${error.message}`);
}

/** Removes everything createCatalogue() made, plus stored files queued for deletion. */
export async function deleteCatalogue(catalogue: Catalogue | undefined): Promise<void> {
  if (!catalogue) return;
  const service = admin();
  const courseIds = Object.values(catalogue.courses);
  await service.from("enrollments").delete().in("course_id", courseIds);
  await service.from("courses").delete().in("id", courseIds);
  await service.from("areas").delete().eq("id", catalogue.areaId);
  await drainStorageDeletions();
}

export async function drainStorageDeletions(): Promise<void> {
  const service = admin();
  const { data } = await service.from("storage_deletions").select("id, bucket_id, object_path");
  if (!data?.length) return;
  await service.storage.from(BUCKET).remove(data.map((row) => row.object_path));
  await service
    .from("storage_deletions")
    .delete()
    .in(
      "id",
      data.map((row) => row.id),
    );
}

let connection: ReturnType<typeof postgres> | undefined;

/** Direct database connection as the migration role, for structural checks. */
export function sql(): ReturnType<typeof postgres> {
  connection ??= postgres(process.env.SUPABASE_DB_URL!, { max: 1, onnotice: () => {} });
  return connection;
}

export async function closeSql(): Promise<void> {
  await connection?.end();
  connection = undefined;
}

const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Subjects of the emails the local mail catcher holds for an address, newest first. */
export async function subjectsSentTo(email: string, atLeast = 1): Promise<string[]> {
  let subjects: string[] = [];
  for (let attempt = 0; attempt < 20 && subjects.length < atLeast; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    const response = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const body = (await response.json()) as { messages: { Subject: string }[] };
    subjects = body.messages.map((message) => message.Subject);
  }
  return subjects;
}
