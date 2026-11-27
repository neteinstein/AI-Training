import { areaColors, type AreaColor, type Locale } from "@/config/site";
import { today } from "@/lib/dates";
import { localized, pickLocalized } from "@/lib/i18n/localized";
import type {
  AreaSummary,
  Catalog,
  Client,
  CourseCard,
  CourseDetail,
  EditionSummary,
  LevelSummary,
  Tables,
} from "./types";

type AreaRow = Tables["areas"]["Row"];
type LevelRow = Tables["levels"]["Row"];
type CourseRow = Tables["courses"]["Row"];
type EditionRow = Tables["editions"]["Row"];

/** The columns of an edition that people are shown. */
export const EDITION_SUMMARY = "id, name_pt, name_en, starts_on, ends_on" as const;

export function toEditionSummary(
  row: Pick<EditionRow, "id" | "name_pt" | "name_en" | "starts_on" | "ends_on">,
  locale: Locale,
): EditionSummary {
  return {
    id: row.id,
    name: pickLocalized(row, "name", locale),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

export function toAreaSummary(row: AreaRow, locale: Locale): AreaSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: pickLocalized(row, "name", locale),
    description: pickLocalized(row, "description", locale),
    color: (areaColors as readonly string[]).includes(row.color)
      ? (row.color as AreaColor)
      : "forest",
    icon: row.icon,
  };
}

/**
 * How many of the three glyph bars a level fills, from its position among all levels:
 * the first level fills one bar, the last fills all three.
 */
export function levelStep(index: number, total: number): 1 | 2 | 3 {
  if (total <= 1) return 1;
  const step = Math.round((index / (total - 1)) * 2) + 1;
  return Math.min(3, Math.max(1, step)) as 1 | 2 | 3;
}

/** Levels in display order, each with its glyph step. */
export function toLevelSummaries(rows: LevelRow[], locale: Locale): LevelSummary[] {
  const ordered = [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug),
  );
  return ordered.map((row, index) => ({
    id: row.id,
    slug: row.slug,
    name: pickLocalized(row, "name", locale),
    description: pickLocalized(row, "description", locale),
    step: levelStep(index, ordered.length),
  }));
}

export function toCourseCard(
  row: CourseRow,
  area: AreaSummary,
  level: LevelSummary,
  locale: Locale,
): CourseCard {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: pickLocalized(row, "title", locale),
    summary: pickLocalized(row, "summary", locale),
    durationHours: row.duration_hours,
    startsOn: row.starts_on,
    location: row.location,
    area,
    level,
  };
}

async function fetchTaxonomy(client: Client, locale: Locale) {
  const [areasResult, levelsResult] = await Promise.all([
    client.from("areas").select("*").order("sort_order").order("slug"),
    client.from("levels").select("*"),
  ]);
  if (areasResult.error) throw new Error(`areas: ${areasResult.error.message}`);
  if (levelsResult.error) throw new Error(`levels: ${levelsResult.error.message}`);

  const areas = areasResult.data.map((row) => toAreaSummary(row, locale));
  const levels = toLevelSummaries(levelsResult.data, locale);
  return {
    areas,
    levels,
    areaById: new Map(areas.map((area) => [area.id, area])),
    levelById: new Map(levels.map((level) => [level.id, level])),
  };
}

/** Everything the public site shows: areas, levels and published courses. */
export async function fetchCatalog(client: Client, locale: Locale): Promise<Catalog> {
  const [{ areas, levels, areaById, levelById }, coursesResult] = await Promise.all([
    fetchTaxonomy(client, locale),
    client
      .from("courses")
      .select("*")
      // Explicit, so the result is the same whoever asks (a trainer's client also sees drafts).
      .eq("status", "published")
      .order("sort_order")
      .order("slug"),
  ]);
  if (coursesResult.error) throw new Error(`courses: ${coursesResult.error.message}`);

  const courses: CourseCard[] = [];
  for (const row of coursesResult.data) {
    const area = areaById.get(row.area_id);
    const level = levelById.get(row.level_id);
    if (area && level) courses.push(toCourseCard(row, area, level, locale));
  }

  return {
    areas: areas.map((area) => ({
      ...area,
      courseCount: courses.filter((course) => course.area.id === area.id).length,
    })),
    levels,
    courses,
  };
}

/**
 * One published course with its description and its coming editions, or null. `onDay` is the
 * day that counts as today ("2027-01-31"): an edition is coming while it has not started.
 */
export async function fetchPublishedCourse(
  client: Client,
  slug: string,
  locale: Locale,
  onDay: string = today(),
): Promise<CourseDetail | null> {
  const { data: row, error } = await client
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`course: ${error.message}`);
  if (!row) return null;

  const [{ areaById, levelById }, editions] = await Promise.all([
    fetchTaxonomy(client, locale),
    client
      .from("editions")
      .select(EDITION_SUMMARY)
      .eq("course_id", row.id)
      // Explicit, so the result is the same whoever asks (a trainer's client sees them all).
      .eq("is_listed", true)
      .gte("starts_on", onDay)
      .order("starts_on")
      .order("created_at"),
  ]);
  if (editions.error) throw new Error(`editions: ${editions.error.message}`);
  const area = areaById.get(row.area_id);
  const level = levelById.get(row.level_id);
  if (!area || !level) return null;

  const description = localized(row, "description", locale);
  return {
    ...toCourseCard(row, area, level, locale),
    description: description.value,
    descriptionLang: description.lang,
    upcomingEditions: editions.data.map((edition) => toEditionSummary(edition, locale)),
  };
}
