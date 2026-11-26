"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/actions/state";
import { failed, succeeded, trainerAction } from "@/lib/actions/trainer";
import { text, textList } from "@/lib/actions/validation";
import { enrollUsers, setUserCourses, unenrollUser } from "./operations";

/** Form handlers for who can open which course. Trainers only. */

export async function addLearners(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const people = textList(formData, "user_ids");
  if (people.length === 0) return failed(t("learners.chooseSomeone"));

  const result = await enrollUsers(supabase, text(formData, "course_id"), people, user.id);
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

/** Makes one person's courses exactly the ones ticked. */
export async function saveUserCourses(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const done = await setUserCourses(
    supabase,
    text(formData, "user_id"),
    textList(formData, "course_ids"),
    user.id,
  );
  refresh();
  return done ? succeeded(t("users.coursesSaved")) : failed(t("common.failed"));
}
