import { drainStorageDeletions } from "@/features/materials/operations";
import {
  blankToNull,
  moved,
  nextSortOrder,
  PG,
  type Bilingual,
  type Direction,
} from "@/lib/dal/mutations";
import type { Client, CourseStatus } from "@/lib/dal/types";
import { isIsoDate } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { isSlug } from "@/lib/slug";

/**
 * Courses: details, status and order. Runs with the caller's own client, so Row Level
 * Security decides whether anything is written.
 */

export type CourseInput = {
  slug: string;
  areaId: string;
  levelId: string;
  title: Bilingual;
  summary: Bilingual;
  /** Markdown. */
  description: Bilingual;
  durationHours: number | null;
  /** The day it takes place (or starts), as YYYY-MM-DD. */
  startsOn: string;
  location: string;
};

export type CourseSaveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "slug_taken" | "needs_summaries" | "invalid" | "not_found" | "failed";
    };

export type StatusResult = "ok" | "needs_summaries" | "not_found" | "failed";

const SUMMARIES_RULE = "courses_summaries_before_leaving_draft";

function saveFailure(error: { code?: string; message?: string }): CourseSaveResult {
  if (error.code === PG.unique) return { ok: false, reason: "slug_taken" };
  if (error.code === PG.check && error.message?.includes(SUMMARIES_RULE)) {
    return { ok: false, reason: "needs_summaries" };
  }
  if (
    error.code === PG.check ||
    error.code === PG.notNull ||
    error.code === PG.foreignKey // the chosen area or level no longer exists
  ) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: "failed" };
}

function courseColumns(input: CourseInput) {
  if (!isSlug(input.slug) || !isUuid(input.areaId) || !isUuid(input.levelId)) return null;
  if (input.title.pt.trim() === "" || input.title.en.trim() === "") return null;
  if (!isIsoDate(input.startsOn) || input.location.trim() === "") return null;
  const hours = input.durationHours;
  if (hours !== null && !(Number.isFinite(hours) && hours > 0 && hours < 10_000)) return null;
  return {
    slug: input.slug,
    area_id: input.areaId,
    level_id: input.levelId,
    title_pt: input.title.pt.trim(),
    title_en: input.title.en.trim(),
    summary_pt: blankToNull(input.summary.pt),
    summary_en: blankToNull(input.summary.en),
    description_pt: blankToNull(input.description.pt),
    description_en: blankToNull(input.description.en),
    duration_hours: hours === null ? null : Math.round(hours * 10) / 10,
    starts_on: input.startsOn,
    location: input.location.trim(),
  };
}

/** A new course always starts as a draft, at the end of the list. */
export async function createCourse(client: Client, input: CourseInput): Promise<CourseSaveResult> {
  const columns = courseColumns(input);
  if (!columns) return { ok: false, reason: "invalid" };

  const { data: last } = await client
    .from("courses")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await client
    .from("courses")
    .insert({ ...columns, status: "draft", sort_order: nextSortOrder(last) })
    .select("id")
    .single();
  if (error || !data) return saveFailure(error ?? {});
  return { ok: true, id: data.id };
}

/**
 * Saves a course's details. A course that is already public must keep both summaries: the
 * database refuses the change otherwise, reported here as "needs_summaries".
 */
export async function updateCourse(
  client: Client,
  id: string,
  input: CourseInput,
): Promise<CourseSaveResult> {
  const columns = courseColumns(input);
  if (!columns) return { ok: false, reason: "invalid" };
  if (!isUuid(id)) return { ok: false, reason: "not_found" };

  const { data, error } = await client
    .from("courses")
    .update(columns)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return saveFailure(error);
  return data ? { ok: true, id: data.id } : { ok: false, reason: "not_found" };
}

/**
 * draft:     only trainers see it
 * published: on the public site, open to its enrolled learners
 * unlisted:  off the public site, enrolled learners keep access
 */
export async function setCourseStatus(
  client: Client,
  id: string,
  status: CourseStatus,
): Promise<StatusResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client
    .from("courses")
    .update({ status })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return error.code === PG.check && error.message.includes(SUMMARIES_RULE)
      ? "needs_summaries"
      : "failed";
  }
  return data ? "ok" : "not_found";
}

export type CourseDeleteResult = "deleted" | "has_learners" | "not_found" | "failed";

/**
 * Deletes a course with its modules and materials, and removes their stored files. A course
 * with enrolled learners is kept: unlist it, or remove the learners first.
 */
export async function deleteCourse(client: Client, id: string): Promise<CourseDeleteResult> {
  if (!isUuid(id)) return "not_found";
  const { data, error } = await client.from("courses").delete().eq("id", id).select("id");
  if (error) return error.code === PG.foreignKey ? "has_learners" : "failed";
  if (data.length === 0) return "not_found";
  await drainStorageDeletions(client);
  return "deleted";
}

/** Moves a course one place up or down in the order the public site uses. */
export async function moveCourse(
  client: Client,
  id: string,
  direction: Direction,
): Promise<boolean> {
  const { data } = await client.from("courses").select("id").order("sort_order").order("slug");
  const order = moved(
    (data ?? []).map((row) => row.id),
    id,
    direction,
  );
  if (!order) return false;
  const { error } = await client.rpc("reorder_courses", { ordered_ids: order });
  return !error;
}
