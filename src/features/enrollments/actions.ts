"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/actions/state";
import { failed, succeeded, trainerAction } from "@/lib/actions/trainer";
import { text, textList } from "@/lib/actions/validation";
import { chosenEditions } from "./fields";
import { enrollUsers, moveLearner, setUserCourses, unenrollUser } from "./operations";

/** Form handlers for who can open which course. Trainers only. */

export async function addLearners(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const people = textList(formData, "user_ids");
  if (people.length === 0) return failed(t("learners.chooseSomeone"));

  // Without an edition the people go to the course's default one.
  const result = await enrollUsers(
    supabase,
    text(formData, "course_id"),
    people,
    user.id,
    text(formData, "edition_id") || undefined,
  );
  refresh();
  if (!result.ok) return failed(t("common.failed"));
  return succeeded(t("learners.added", { count: result.added }));
}

export async function removeLearner(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await unenrollUser(supabase, text(formData, "course_id"), text(formData, "user_id"));
  refresh();
  return done ? succeeded(t("learners.removed")) : failed(t("common.gone"));
}

/** Moves one person to another edition of the course they are in. */
export async function moveLearnerTo(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await moveLearner(
    supabase,
    text(formData, "course_id"),
    text(formData, "user_id"),
    text(formData, "edition_id"),
  );
  refresh();
  if (!done) return failed(t("common.failed"));
  return succeeded(t("learners.moved", { name: text(formData, "edition_name").slice(0, 200) }));
}

/** Makes one person's courses exactly the ones ticked, each in the edition chosen. */
export async function saveUserCourses(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const courseIds = textList(formData, "course_ids");
  const editions = chosenEditions(formData, courseIds);
  const done = await setUserCourses(
    supabase,
    text(formData, "user_id"),
    courseIds.map((courseId) => ({ courseId, editionId: editions[courseId] })),
    user.id,
  );
  refresh();
  return done ? succeeded(t("users.coursesSaved")) : failed(t("common.failed"));
}
