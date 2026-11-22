import type { Client } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";

/**
 * Enrolments: who can open which course. Runs with the caller's own client; Row Level
 * Security lets only trainers add or remove them.
 */

/**
 * Adds people to a course. Anyone already in it is left as they are. `added` counts the new
 * enrolments only.
 */
export async function enrollUsers(
  client: Client,
  courseId: string,
  userIds: string[],
  createdBy: string,
): Promise<{ ok: boolean; added: number }> {
  const ids = [...new Set(userIds)].filter(isUuid);
  if (!isUuid(courseId)) return { ok: false, added: 0 };
  if (ids.length === 0) return { ok: true, added: 0 };

  const { data, error } = await client
    .from("enrollments")
    .upsert(
      ids.map((user_id) => ({ user_id, course_id: courseId, created_by: createdBy })),
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    )
    .select("user_id");
  return error ? { ok: false, added: 0 } : { ok: true, added: data.length };
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

/** Makes a person's courses exactly the given list: adds the missing, removes the others. */
export async function setUserCourses(
  client: Client,
  userId: string,
  courseIds: string[],
  createdBy: string,
): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const wanted = new Set(courseIds.filter(isUuid));

  const { data: current, error } = await client
    .from("enrollments")
    .select("course_id")
    .eq("user_id", userId);
  if (error) return false;
  const existing = new Set(current.map((row) => row.course_id));

  const toAdd = [...wanted].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error: addError } = await client
      .from("enrollments")
      .insert(toAdd.map((course_id) => ({ user_id: userId, course_id, created_by: createdBy })));
    if (addError) return false;
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
