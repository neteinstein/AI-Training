"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { failed, leaveNotice, succeeded, trainerAction } from "@/lib/actions/trainer";
import { checked, fieldErrors, fields, text } from "@/lib/actions/validation";
import { routes } from "@/lib/routes";
import {
  createEdition,
  deleteEdition,
  makeDefaultEdition,
  setHiddenInEdition,
  updateEdition,
} from "./operations";
import { editionFields, editionSchema } from "./schemas";

/**
 * Form handlers for a course's editions. Trainers only; the database checks again with the
 * caller's own client. (The public page of a course lists its coming editions; it is read
 * fresh on every visit, so a change here shows there at once.)
 */

export async function saveEdition(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { locale, supabase, t, tv } = await trainerAction(formData);
  const id = text(formData, "id");
  const isListed = checked(formData, "is_listed");
  const values: Record<string, string> = {
    ...fields(formData, editionFields),
    is_listed: isListed ? "on" : "",
  };

  const parsed = editionSchema.safeParse({ ...values, is_listed: isListed });
  if (!parsed.success) {
    return failed(t("common.checkFields"), { fieldErrors: fieldErrors(parsed.error, tv), values });
  }

  const result = id
    ? await updateEdition(supabase, id, parsed.data)
    : await createEdition(supabase, text(formData, "course_id"), parsed.data);
  if (!result.ok) {
    if (result.reason === "invalid") return failed(t("common.checkFields"), { values });
    return failed(t(result.reason === "not_found" ? "common.gone" : "common.failed"), { values });
  }

  // Where to go back to is read from what was saved, not from the form.
  const { data: saved } = await supabase
    .from("editions")
    .select("course_id")
    .eq("id", result.id)
    .maybeSingle();
  if (!saved) return failed(t("common.gone"), { values });

  await leaveNotice(id ? t("common.saved") : t("editions.created"));
  return redirect({ href: routes.trainerCourseEditions(saved.course_id), locale });
}

export async function removeEdition(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const result = await deleteEdition(supabase, text(formData, "id"));
  refresh();
  switch (result) {
    case "deleted":
      return succeeded(t("editions.deleted"));
    case "has_learners":
      return failed(t("editions.hasLearners"));
    case "last_edition":
      return failed(t("editions.lastOne"));
    case "not_found":
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}

/** Makes one edition the place where the course's new learners go. */
export async function makeDefault(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await makeDefaultEdition(supabase, text(formData, "id"));
  refresh();
  return done ? succeeded(t("editions.madeDefault")) : failed(t("common.failed"));
}

/** Shows one of the course's materials in an edition, or hides it there. */
export async function setShownInEdition(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await setHiddenInEdition(
    supabase,
    text(formData, "edition_id"),
    text(formData, "material_id"),
    text(formData, "visible") !== "true",
  );
  refresh();
  // The switch itself shows the new state; only a failure needs words.
  return done ? succeeded() : failed(t("common.failed"));
}
