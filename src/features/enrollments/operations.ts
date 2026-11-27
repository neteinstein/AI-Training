import type { Client } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";

/**
 * Enrolments: who can open which course, and in which of its editions. Runs with the caller's
 * own client; Row Level Security lets only trainers add, move or remove them.
 */

/**
 * Where a course's new learners go when no edition is named: its default edition, or else its
 * oldest. Courses the caller cannot see the editions of are simply missing from the answer.
 */
export async function defaultEditionIds(
  client: Client,
  courseIds: string[],
): Promise<Map<string, string>> {
  const byCourse = new Map<string, string>();
  const ids = [...new Set(courseIds)].filter(isUuid);
  if (ids.length === 0) return byCourse;

  const { data, error } = await client
    .from("editions")
    .select("id, course_id")
    .in("course_id", ids)
    .order("is_default", { ascending: false })
    .order("created_at")
    .order("id");
  if (error) return byCourse;
  for (const row of data) {
    if (!byCourse.has(row.course_id)) byCourse.set(row.course_id, row.id);
  }
  return byCourse;
}

/**
 * Adds people to a course: to the edition named, or to the course's default one. Anyone
 * already in the course is left where they are. `added` counts the new enrolments only.
 */
export async function enrollUsers(
  client: Client,
  courseId: string,
  userIds: string[],
  createdBy: string,
  editionId?: string,
): Promise<{ ok: boolean; added: number }> {
  const ids = [...new Set(userIds)].filter(isUuid);
  if (!isUuid(courseId) || (editionId !== undefined && !isUuid(editionId))) {
    return { ok: false, added: 0 };
  }
  if (ids.length === 0) return { ok: true, added: 0 };

  const edition = editionId ?? (await defaultEditionIds(client, [courseId])).get(courseId);
  if (!edition) return { ok: false, added: 0 };

  const { data, error } = await client
    .from("enrollments")
    .upsert(
      ids.map((user_id) => ({
        user_id,
        course_id: courseId,
        edition_id: edition,
        created_by: createdBy,
      })),
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    )
    .select("user_id");
  return error ? { ok: false, added: 0 } : { ok: true, added: data.length };
}

/** Moves one person to another edition of the same course. True when they were moved. */
export async function moveLearner(
  client: Client,
  courseId: string,
  userId: string,
  editionId: string,
): Promise<boolean> {
  if (!isUuid(courseId) || !isUuid(userId) || !isUuid(editionId)) return false;
  const { data, error } = await client
    .from("enrollments")
    .update({ edition_id: editionId })
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .neq("edition_id", editionId)
    .select("user_id");
  return !error && data.length > 0;
}

/** Removes one person from a course. True when an enrolment was actually removed. */
export async function unenrollUser(
  client: Client,
  courseId: string,
  userId: string,
): Promise<boolean> {
  if (!isUuid(courseId) || !isUuid(userId)) return false;
  const { data, error } = await client
    .from("enrollments")
    .delete()
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .select("user_id");
  return !error && data.length > 0;
}

/** A course a person should be in. Without an edition: wherever they are, or the default one. */
export type WantedCourse = string | { courseId: string; editionId?: string | null };

/**
 * Makes a person's courses exactly the given list: adds the missing, removes the others, and
 * moves the person where a different edition is named.
 */
export async function setUserCourses(
  client: Client,
  userId: string,
  courses: WantedCourse[],
  createdBy: string,
): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const wanted = new Map<string, string | null>();
  for (const entry of courses) {
    const courseId = typeof entry === "string" ? entry : entry.courseId;
    const editionId = typeof entry === "string" ? null : (entry.editionId ?? null);
    if (isUuid(courseId)) wanted.set(courseId, editionId && isUuid(editionId) ? editionId : null);
  }

  const { data: current, error } = await client
    .from("enrollments")
    .select("course_id, edition_id")
    .eq("user_id", userId);
  if (error) return false;
  const existing = new Map(current.map((row) => [row.course_id, row.edition_id]));

  const toAdd = [...wanted.keys()].filter((id) => !existing.has(id));
  const toRemove = [...existing.keys()].filter((id) => !wanted.has(id));
  const toMove = [...wanted].filter(
    ([courseId, editionId]) =>
      editionId !== null && existing.has(courseId) && existing.get(courseId) !== editionId,
  );

  if (toAdd.length > 0) {
    const defaults = await defaultEditionIds(
      client,
      toAdd.filter((id) => wanted.get(id) === null),
    );
    const rows = [];
    for (const course_id of toAdd) {
      const edition_id = wanted.get(course_id) ?? defaults.get(course_id);
      if (!edition_id) return false;
      rows.push({ user_id: userId, course_id, edition_id, created_by: createdBy });
    }
    const { error: addError } = await client.from("enrollments").insert(rows);
    if (addError) return false;
  }
  for (const [courseId, editionId] of toMove) {
    const { error: moveError } = await client
      .from("enrollments")
      .update({ edition_id: editionId! })
      .eq("user_id", userId)
      .eq("course_id", courseId);
    if (moveError) return false;
  }
  if (toRemove.length > 0) {
    const { error: removeError } = await client
      .from("enrollments")
      .delete()
      .eq("user_id", userId)
      .in("course_id", toRemove);
    if (removeError) return false;
  }
  return true;
}
