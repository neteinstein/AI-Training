import { areaColors, type AreaColor, type Locale } from "@/config/site";
import { parseEmbed, type ParsedEmbed } from "@/lib/embeds/parse";
import { isUuid } from "@/lib/ids";
import { pickLocalized, translationGaps } from "@/lib/i18n/localized";
import { levelStep } from "./catalog-queries";
import type { Bilingual } from "./mutations";
import { bySortOrder } from "./order";
import type { Client, CourseStatus, MaterialKind, RequestStatus, Tables, UserRole } from "./types";

/**
 * What the back-office reads. These queries are meant for a trainer's client. Row Level
 * Security still decides what comes back, so with anyone else's client they return no more
 * than that person may see anyway (their own profile, the public courses).
 * Editing screens get both languages; lists get the interface language.
 */

type MaterialRow = Tables["materials"]["Row"];
type ProfileRow = Tables["profiles"]["Row"];

function both(row: Record<string, unknown>, field: string): Bilingual {
  const read = (lang: Locale) => {
    const value = row[`${field}_${lang}`];
    return typeof value === "string" ? value : "";
  };
  return { pt: read("pt"), en: read("en") };
}

const toLocale = (value: string | null): Locale => (value === "en" ? "en" : "pt");
const toColor = (value: string): AreaColor =>
  (areaColors as readonly string[]).includes(value) ? (value as AreaColor) : "forest";
const countOf = (rows: { count: number }[] | null | undefined): number => rows?.[0]?.count ?? 0;

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ---------------------------------------------------------------------------------------------
// Areas and levels
// ---------------------------------------------------------------------------------------------

export type TrainerArea = {
  id: string;
  slug: string;
  name: Bilingual;
  description: Bilingual;
  color: AreaColor;
  icon: string;
  /** Courses of any status. An area with courses cannot be deleted. */
  courseCount: number;
};

export async function fetchTrainerAreas(client: Client): Promise<TrainerArea[]> {
  const { data, error } = await client
    .from("areas")
    .select("*, courses(count)")
    .order("sort_order")
    .order("slug");
  check("areas", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: both(row, "name"),
    description: both(row, "description"),
    color: toColor(row.color),
    icon: row.icon,
    courseCount: countOf(row.courses),
  }));
}

export type TrainerLevel = {
  id: string;
  slug: string;
  name: Bilingual;
  description: Bilingual;
  step: 1 | 2 | 3;
  courseCount: number;
};

export async function fetchTrainerLevels(client: Client): Promise<TrainerLevel[]> {
  const { data, error } = await client
    .from("levels")
    .select("*, courses(count)")
    .order("sort_order")
    .order("slug");
  check("levels", error);
  const rows = data ?? [];
  return rows.map((row, index) => ({
    id: row.id,
    slug: row.slug,
    name: both(row, "name"),
    description: both(row, "description"),
    step: levelStep(index, rows.length),
    courseCount: countOf(row.courses),
  }));
}

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

export type TrainerCourseRow = {
  id: string;
  slug: string;
  status: CourseStatus;
  title: string;
  /** Languages some text of the course has not been translated into. */
  gaps: Locale[];
  area: { id: string; name: string; color: AreaColor; icon: string };
  level: { id: string; name: string; step: 1 | 2 | 3 };
  durationHours: number | null;
  learnerCount: number;
  updatedAt: string;
};

/** Every course, in the order the public site shows them. */
export async function fetchTrainerCourses(
  client: Client,
  locale: Locale,
): Promise<TrainerCourseRow[]> {
  const [courses, areas, levels] = await Promise.all([
    client.from("courses").select("*, enrollments(count)").order("sort_order").order("slug"),
    client.from("areas").select("*"),
    client.from("levels").select("*").order("sort_order").order("slug"),
  ]);
  check("courses", courses.error);
  check("areas", areas.error);
  check("levels", levels.error);

  const areaById = new Map((areas.data ?? []).map((row) => [row.id, row]));
  const levelRows = levels.data ?? [];
  const levelById = new Map(
    levelRows.map((row, index) => [row.id, { row, step: levelStep(index, levelRows.length) }]),
  );

  return (courses.data ?? []).flatMap((row) => {
    const area = areaById.get(row.area_id);
    const level = levelById.get(row.level_id);
    if (!area || !level) return [];
    return [
      {
        id: row.id,
        slug: row.slug,
        status: row.status,
        title: pickLocalized(row, "title", locale),
        gaps: translationGaps(row, ["title", "summary", "description"]),
        area: {
          id: area.id,
          name: pickLocalized(area, "name", locale),
          color: toColor(area.color),
          icon: area.icon,
        },
        level: {
          id: level.row.id,
          name: pickLocalized(level.row, "name", locale),
          step: level.step,
        },
        durationHours: row.duration_hours,
        learnerCount: countOf(row.enrollments),
        updatedAt: row.updated_at,
      },
    ];
  });
}

export type TrainerCourse = {
  id: string;
  slug: string;
  status: CourseStatus;
  areaId: string;
  levelId: string;
  title: Bilingual;
  summary: Bilingual;
  /** Markdown. */
  description: Bilingual;
  durationHours: number | null;
  publishedAt: string | null;
  updatedAt: string;
  learnerCount: number;
};

export async function fetchTrainerCourse(
  client: Client,
  id: string,
): Promise<TrainerCourse | null> {
  if (!isUuid(id)) return null;
  const { data: row, error } = await client
    .from("courses")
    .select("*, enrollments(count)")
    .eq("id", id)
    .maybeSingle();
  check("course", error);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    areaId: row.area_id,
    levelId: row.level_id,
    title: both(row, "title"),
    summary: both(row, "summary"),
    description: both(row, "description"),
    durationHours: row.duration_hours,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    learnerCount: countOf(row.enrollments),
  };
}

export type CourseOption = { id: string; title: string; status: CourseStatus; areaName: string };

/** Courses to choose from when inviting or enrolling someone. */
export async function fetchCourseOptions(client: Client, locale: Locale): Promise<CourseOption[]> {
  const { data, error } = await client
    .from("courses")
    .select("id, status, title_pt, title_en, sort_order, slug, areas(name_pt, name_en)")
    .order("sort_order")
    .order("slug");
  check("courses", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    title: pickLocalized(row, "title", locale),
    areaName: pickLocalized(row.areas, "name", locale),
  }));
}

// ---------------------------------------------------------------------------------------------
// Course content
// ---------------------------------------------------------------------------------------------

export type BuilderMaterial = {
  id: string;
  kind: MaterialKind;
  title: Bilingual;
  description: Bilingual;
  contentLanguage: Locale | null;
  isPublished: boolean;
  /** The address as stored, for videos, Google documents and links. */
  url: string | null;
  /** Frame details when the stored address is a supported video or Google document. */
  embed: ParsedEmbed | null;
  file: { name: string; mimeType: string; sizeBytes: number } | null;
  /** Languages the title, description or text has not been translated into. */
  gaps: Locale[];
};

export type BuilderModule = {
  id: string;
  title: Bilingual;
  description: Bilingual;
  gaps: Locale[];
  materials: BuilderMaterial[];
};

function toBuilderMaterial(row: MaterialRow): BuilderMaterial {
  return {
    id: row.id,
    kind: row.kind,
    title: both(row, "title"),
    description: both(row, "description"),
    contentLanguage:
      row.content_language === "pt" || row.content_language === "en" ? row.content_language : null,
    isPublished: row.is_published,
    url: row.url,
    embed:
      (row.kind === "video" || row.kind === "embed") && row.url
        ? parseEmbed(row.kind, row.url)
        : null,
    file:
      row.kind === "file" && row.file_name
        ? {
            name: row.file_name,
            mimeType: row.mime_type ?? "application/octet-stream",
            sizeBytes: row.size_bytes ?? 0,
          }
        : null,
    gaps: translationGaps(row, ["title", "description", "body"]),
  };
}

/** A course's modules with all their materials, hidden ones included, in order. */
export async function fetchCourseBuilder(
  client: Client,
  courseId: string,
): Promise<BuilderModule[]> {
  if (!isUuid(courseId)) return [];
  const { data, error } = await client
    .from("modules")
    .select("*, materials(*)")
    .eq("course_id", courseId);
  check("modules", error);
  return [...(data ?? [])].sort(bySortOrder).map((module) => ({
    id: module.id,
    title: both(module, "title"),
    description: both(module, "description"),
    gaps: translationGaps(module, ["title", "description"]),
    materials: [...module.materials].sort(bySortOrder).map(toBuilderMaterial),
  }));
}

export type EditableMaterial = BuilderMaterial & {
  moduleId: string;
  courseId: string;
  /** Markdown, for text pages. */
  body: Bilingual;
};

/** One material with everything its edit form needs. */
export async function fetchEditableMaterial(
  client: Client,
  id: string,
): Promise<EditableMaterial | null> {
  if (!isUuid(id)) return null;
  const { data: row, error } = await client
    .from("materials")
    .select("*, modules(course_id)")
    .eq("id", id)
    .maybeSingle();
  check("material", error);
  if (!row) return null;
  return {
    ...toBuilderMaterial(row),
    moduleId: row.module_id,
    courseId: row.modules.course_id,
    body: both(row, "body"),
  };
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export type Person = {
  id: string;
  email: string;
  fullName: string;
  /** Invited, but the invitation has not been accepted yet. */
  isPending: boolean;
};

const toPerson = (
  row: Pick<ProfileRow, "id" | "email" | "full_name" | "email_confirmed_at">,
): Person => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  isPending: row.email_confirmed_at === null,
});

const byName = (a: Person, b: Person) =>
  (a.fullName || a.email).localeCompare(b.fullName || b.email, "pt", { sensitivity: "base" });

export type CourseLearner = Person & { role: UserRole; enrolledAt: string };

/** The people enrolled in a course, by name. */
export async function fetchCourseLearners(
  client: Client,
  courseId: string,
): Promise<CourseLearner[]> {
  if (!isUuid(courseId)) return [];
  const { data, error } = await client
    .from("enrollments")
    .select(
      "created_at, profiles!enrollments_user_id_fkey(id, email, full_name, role, email_confirmed_at)",
    )
    .eq("course_id", courseId);
  check("enrollments", error);
  return (data ?? [])
    .map((row) => ({
      ...toPerson(row.profiles),
      role: row.profiles.role,
      enrolledAt: row.created_at,
    }))
    .sort(byName);
}

/** Learners who could be added to a course: everyone with an account who is not in it yet. */
export async function fetchPeopleNotEnrolled(client: Client, courseId: string): Promise<Person[]> {
  if (!isUuid(courseId)) return [];
  const [people, enrolled] = await Promise.all([
    client
      .from("profiles")
      .select("id, email, full_name, email_confirmed_at")
      .eq("role", "learner"),
    client.from("enrollments").select("user_id").eq("course_id", courseId),
  ]);
  check("profiles", people.error);
  check("enrollments", enrolled.error);
  const taken = new Set((enrolled.data ?? []).map((row) => row.user_id));
  return (people.data ?? [])
    .filter((row) => !taken.has(row.id))
    .map(toPerson)
    .sort(byName);
}

export type TrainerUserRow = Person & {
  role: UserRole;
  locale: Locale;
  courseCount: number;
  createdAt: string;
};

type ProfileWithCount = ProfileRow & { enrollments: { count: number }[] };

const toUserRow = (row: ProfileWithCount): TrainerUserRow => ({
  ...toPerson(row),
  role: row.role,
  locale: toLocale(row.locale),
  courseCount: countOf(row.enrollments),
  createdAt: row.created_at,
});

const PROFILE_WITH_COUNT = "*, enrollments!enrollments_user_id_fkey(count)" as const;

/** Everyone with an account or a pending invitation, newest first. */
export async function fetchTrainerUsers(client: Client): Promise<TrainerUserRow[]> {
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_WITH_COUNT)
    .order("created_at", { ascending: false })
    .order("email");
  check("profiles", error);
  return (data ?? []).map(toUserRow);
}

export type TrainerUser = TrainerUserRow & { courseIds: string[] };

export async function fetchTrainerUser(client: Client, id: string): Promise<TrainerUser | null> {
  if (!isUuid(id)) return null;
  const [profile, enrollments] = await Promise.all([
    client.from("profiles").select(PROFILE_WITH_COUNT).eq("id", id).maybeSingle(),
    client.from("enrollments").select("course_id").eq("user_id", id),
  ]);
  check("profile", profile.error);
  check("enrollments", enrollments.error);
  if (!profile.data) return null;
  return {
    ...toUserRow(profile.data),
    courseIds: (enrollments.data ?? []).map((row) => row.course_id),
  };
}

// ---------------------------------------------------------------------------------------------
// Information requests
// ---------------------------------------------------------------------------------------------

export type TrainerRequest = {
  id: string;
  name: string;
  email: string;
  organisation: string;
  message: string;
  /** Language the person used on the site: invitations to them default to it. */
  locale: Locale;
  status: RequestStatus;
  course: { id: string; title: string } | null;
  createdAt: string;
  handledAt: string | null;
  /** The account that already exists for this address, if any. */
  account: { id: string; isPending: boolean } | null;
};

/** Information requests, newest first, optionally only those in one state. */
export async function fetchTrainerRequests(
  client: Client,
  locale: Locale,
  options: { status?: RequestStatus; limit?: number } = {},
): Promise<TrainerRequest[]> {
  let query = client
    .from("info_requests")
    .select("*, courses(id, title_pt, title_en)")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 500);
  if (options.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  check("requests", error);
  const rows = data ?? [];

  const emails = [...new Set(rows.map((row) => row.email))];
  const accounts = new Map<string, { id: string; isPending: boolean }>();
  if (emails.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, email, email_confirmed_at")
      .in("email", emails);
    check("profiles", profilesError);
    for (const profile of profiles ?? []) {
      accounts.set(profile.email, {
        id: profile.id,
        isPending: profile.email_confirmed_at === null,
      });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    organisation: row.organisation ?? "",
    message: row.message ?? "",
    locale: toLocale(row.locale),
    status: row.status,
    course: row.courses
      ? { id: row.courses.id, title: pickLocalized(row.courses, "title", locale) }
      : null,
    createdAt: row.created_at,
    handledAt: row.handled_at,
    account: accounts.get(row.email) ?? null,
  }));
}

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------

export type Dashboard = {
  courses: Record<CourseStatus, number>;
  /** Learners who have accepted their invitation. */
  activeLearners: number;
  pendingInvitations: number;
  newRequests: number;
  latestRequests: TrainerRequest[];
  pendingPeople: TrainerUserRow[];
};

export async function fetchDashboard(client: Client, locale: Locale): Promise<Dashboard> {
  const [courses, learners, pending, pendingPeople, newRequests, latestRequests] =
    await Promise.all([
      client.from("courses").select("status"),
      client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "learner")
        .not("email_confirmed_at", "is", null),
      client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .is("email_confirmed_at", null),
      client
        .from("profiles")
        .select(PROFILE_WITH_COUNT)
        .is("email_confirmed_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      client.from("info_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
      fetchTrainerRequests(client, locale, { status: "new", limit: 5 }),
    ]);
  check("courses", courses.error);
  check("learners", learners.error);
  check("pending", pending.error);
  check("pending people", pendingPeople.error);
  check("requests", newRequests.error);

  const byStatus: Record<CourseStatus, number> = { draft: 0, published: 0, unlisted: 0 };
  for (const row of courses.data ?? []) byStatus[row.status] += 1;

  return {
    courses: byStatus,
    activeLearners: learners.count ?? 0,
    pendingInvitations: pending.count ?? 0,
    newRequests: newRequests.count ?? 0,
    latestRequests,
    pendingPeople: (pendingPeople.data ?? []).map(toUserRow),
  };
}
