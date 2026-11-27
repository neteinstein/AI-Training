import type { Locale } from "@/config/site";
import { parseEmbed, parseExternalLink } from "@/lib/embeds/parse";
import { isUuid } from "@/lib/ids";
import { localized, pickLocalized } from "@/lib/i18n/localized";
import {
  EDITION_SUMMARY,
  toAreaSummary,
  toCourseCard,
  toEditionSummary,
  toLevelSummaries,
} from "./catalog-queries";
import { byEditionOrder, bySortOrder } from "./order";
import type {
  Client,
  CourseCard,
  CourseContent,
  EditionSummary,
  MaterialItem,
  MaterialPage,
  ModuleWithMaterials,
  Tables,
} from "./types";

type CourseRow = Tables["courses"]["Row"];
type MaterialRow = Tables["materials"]["Row"];

async function toCourseCards(client: Client, rows: CourseRow[], locale: Locale) {
  if (rows.length === 0) return [];
  const [areas, levels] = await Promise.all([
    client.from("areas").select("*"),
    client.from("levels").select("*"),
  ]);
  if (areas.error) throw new Error(`areas: ${areas.error.message}`);
  if (levels.error) throw new Error(`levels: ${levels.error.message}`);

  const areaById = new Map(areas.data.map((row) => [row.id, toAreaSummary(row, locale)]));
  const levelById = new Map(
    toLevelSummaries(levels.data, locale).map((level) => [level.id, level]),
  );

  const cards: CourseCard[] = [];
  for (const row of rows) {
    const area = areaById.get(row.area_id);
    const level = levelById.get(row.level_id);
    if (area && level) cards.push(toCourseCard(row, area, level, locale));
  }
  return cards;
}

export function toMaterialItem(row: MaterialRow, locale: Locale): MaterialItem {
  const title = localized(row, "title", locale);
  return {
    id: row.id,
    kind: row.kind,
    title: title.value,
    titleLang: title.lang,
    description: pickLocalized(row, "description", locale),
    contentLanguage:
      row.content_language === "pt" || row.content_language === "en" ? row.content_language : null,
    isPublished: row.is_published,
    url: row.kind === "link" && row.url ? parseExternalLink(row.url) : null,
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
    editionId: row.edition_id,
  };
}

/**
 * The courses a user is enrolled in and may open. Drafts are left out by Row Level Security:
 * a learner cannot read a draft course even when enrolled in it.
 */
export async function fetchMyCourses(
  client: Client,
  userId: string,
  locale: Locale,
): Promise<CourseCard[]> {
  const { data, error } = await client
    .from("enrollments")
    .select("created_at, courses!inner(*)")
    .eq("user_id", userId)
    .in("courses.status", ["published", "unlisted"]);
  if (error) throw new Error(`enrollments: ${error.message}`);

  const rows = data
    .map((row) => row.courses)
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug));
  return toCourseCards(client, rows, locale);
}

/** What a trainer may ask to look at, in place of the whole course. */
export type Preview = {
  /** Show the course as the learners of this edition see it, plus what is still hidden. */
  editionId?: string | null;
};

/**
 * A course with its modules and materials, as the given user may see it, or null when they
 * may not open it.
 *
 * A learner gets what their edition shows: Row Level Security decides, this function only
 * asks. A trainer gets every material, hidden ones included, or with `preview.editionId` what
 * falls to that edition: the course's materials it does not hide, and its own.
 */
export async function fetchCourseContent(
  client: Client,
  viewer: { id: string; role: "learner" | "trainer" },
  slug: string,
  locale: Locale,
  preview: Preview = {},
): Promise<CourseContent | null> {
  const { data: courseRow, error } = await client
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`course: ${error.message}`);
  if (!courseRow) return null;

  let edition: EditionSummary | null = null;
  let editions: EditionSummary[] = [];
  /** Set when a trainer previews one edition: what does not fall to it is left out. */
  let scope: { editionId: string; hidden: Set<string> } | null = null;

  if (viewer.role !== "trainer") {
    // A published course is public, so being able to read its row proves nothing: the
    // learner area is only for people enrolled in it.
    if (courseRow.status === "draft") return null;
    const { data: enrollment, error: enrollmentError } = await client
      .from("enrollments")
      .select("course_id, edition_id")
      .eq("user_id", viewer.id)
      .eq("course_id", courseRow.id)
      .maybeSingle();
    if (enrollmentError) throw new Error(`enrollment: ${enrollmentError.message}`);
    if (!enrollment) return null;

    const { data: editionRow, error: editionError } = await client
      .from("editions")
      .select(EDITION_SUMMARY)
      .eq("id", enrollment.edition_id)
      .maybeSingle();
    if (editionError) throw new Error(`edition: ${editionError.message}`);
    edition = editionRow ? toEditionSummary(editionRow, locale) : null;
  } else {
    const { data: editionRows, error: editionsError } = await client
      .from("editions")
      .select(`${EDITION_SUMMARY}, created_at, edition_hidden_materials(material_id)`)
      .eq("course_id", courseRow.id);
    if (editionsError) throw new Error(`editions: ${editionsError.message}`);
    const ordered = [...editionRows].sort(byEditionOrder);
    editions = ordered.map((row) => toEditionSummary(row, locale));
    const chosen = ordered.find((row) => row.id === preview.editionId);
    if (chosen) {
      edition = toEditionSummary(chosen, locale);
      scope = {
        editionId: chosen.id,
        hidden: new Set(chosen.edition_hidden_materials.map((row) => row.material_id)),
      };
    }
  }

  const [course] = await toCourseCards(client, [courseRow], locale);
  if (!course) return null;

  const { data: moduleRows, error: modulesError } = await client
    .from("modules")
    .select("*, materials(*)")
    .eq("course_id", courseRow.id);
  if (modulesError) throw new Error(`modules: ${modulesError.message}`);

  // The same rule as the database's own (private.edition_materials), without "published":
  // a trainer also sees what is still hidden from everyone, marked as such.
  const inScope = (row: MaterialRow) =>
    !scope ||
    ((row.edition_id === null || row.edition_id === scope.editionId) && !scope.hidden.has(row.id));

  const modules: ModuleWithMaterials[] = [...moduleRows].sort(bySortOrder).map((module) => ({
    id: module.id,
    title: pickLocalized(module, "title", locale),
    description: pickLocalized(module, "description", locale),
    materials: [...module.materials]
      .filter(inScope)
      .sort(bySortOrder)
      .map((row) => toMaterialItem(row, locale)),
  }));

  return { course, modules, edition, editions };
}

/** One material with its course, module and neighbours, or null when it is out of reach. */
export async function fetchMaterialPage(
  client: Client,
  viewer: { id: string; role: "learner" | "trainer" },
  slug: string,
  materialId: string,
  locale: Locale,
  preview: Preview = {},
): Promise<MaterialPage | null> {
  const content = await fetchCourseContent(client, viewer, slug, locale, preview);
  if (!content) return null;

  // Reading order across the whole course, so "next" can cross into the following module.
  const ordered = content.modules.flatMap((module) =>
    module.materials.map((material) => ({ module, material })),
  );
  const index = ordered.findIndex((entry) => entry.material.id === materialId);
  if (index < 0) return null;

  const { module, material } = ordered[index];
  let body = "";
  let bodyLang = locale;
  if (material.kind === "page") {
    const { data: row, error } = await client
      .from("materials")
      .select("body_pt, body_en")
      .eq("id", materialId)
      .maybeSingle();
    if (error) throw new Error(`material: ${error.message}`);
    const text = localized(row, "body", locale);
    body = text.value;
    bodyLang = text.lang;
  }

  const neighbour = (entry: (typeof ordered)[number] | undefined) =>
    entry ? { id: entry.material.id, title: entry.material.title } : null;

  return {
    course: content.course,
    edition: content.edition,
    module: {
      id: module.id,
      title: module.title,
      number: content.modules.findIndex((entry) => entry.id === module.id) + 1,
    },
    material: { ...material, body, bodyLang },
    previous: neighbour(ordered[index - 1]),
    next: neighbour(ordered[index + 1]),
  };
}

/**
 * Where a file material is stored, for the download route. Row Level Security on `materials`
 * decides whether the caller gets a row at all.
 */
export async function fetchMaterialFile(
  client: Client,
  materialId: string,
): Promise<{ storagePath: string; fileName: string; mimeType: string } | null> {
  if (!isUuid(materialId)) return null;
  const { data, error } = await client
    .from("materials")
    .select("kind, storage_path, file_name, mime_type")
    .eq("id", materialId)
    .maybeSingle();
  if (error) throw new Error(`material: ${error.message}`);
  if (!data || data.kind !== "file" || !data.storage_path || !data.file_name) return null;
  return {
    storagePath: data.storage_path,
    fileName: data.file_name,
    mimeType: data.mime_type ?? "application/octet-stream",
  };
}
