"use server";

import { refresh } from "next/cache";
import { freeSlug } from "@/features/catalog/operations";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { failed, leaveNotice, succeeded, trainerAction } from "@/lib/actions/trainer";
import { fieldErrors, fields, text } from "@/lib/actions/validation";
import type { Direction } from "@/lib/dal/mutations";
import { routes } from "@/lib/routes";
import { slugify } from "@/lib/slug";
import {
  createCourse,
  deleteCourse,
  moveCourse,
  setCourseStatus,
  updateCourse,
} from "./operations";
import { courseFields, courseSchema, courseStatusSchema } from "./schemas";

/** Form handlers for courses: details, status, order and deletion. Trainers only. */

export async function saveCourse(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, supabase, t, tv } = await trainerAction(formData);
  const id = text(formData, "id");
  const values = fields(formData, courseFields);

  // An empty address is proposed from the English title.
  const typedSlug = values.slug.trim();
  const slug =
    typedSlug ||
    (await freeSlug(supabase, "courses", slugify(values.title_en) || slugify(values.title_pt)));

  const parsed = courseSchema.safeParse({ ...values, slug });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error, tv);
    if (!typedSlug) delete errors.slug;
    return failed(t("common.checkFields"), { fieldErrors: errors, values });
  }

  const result = id
    ? await updateCourse(supabase, id, parsed.data)
    : await createCourse(supabase, parsed.data);
  if (!result.ok) {
    switch (result.reason) {
      case "slug_taken":
        return failed(t("common.checkFields"), {
          fieldErrors: { slug: t("courses.slugTaken") },
          values: { ...values, slug },
        });
      case "needs_summaries": {
        // A course that is already public keeps both summaries.
        const missing: Record<string, string> = {};
        if (parsed.data.summary.pt === "") missing.summary_pt = tv("required");
        if (parsed.data.summary.en === "") missing.summary_en = tv("required");
        return failed(t("courses.summariesWhilePublic"), { fieldErrors: missing, values });
      }
      case "invalid":
        return failed(t("common.checkFields"), { values });
      case "not_found":
        return failed(t("common.gone"), { values });
      default:
        return failed(t("common.failed"), { values });
    }
  }

  if (!id) {
    await leaveNotice(t("courses.created"));
    return redirect({ href: routes.trainerCourseContent(result.id), locale });
  }
  refresh();
  return succeeded(t("common.saved"), { values: { ...values, slug } });
}

export async function changeCourseStatus(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const status = courseStatusSchema.safeParse(text(formData, "status"));
  if (!status.success) return failed(t("common.failed"));

  const result = await setCourseStatus(supabase, text(formData, "id"), status.data);
  switch (result) {
    case "ok":
      refresh();
      return succeeded(t("courses.statusChanged"));
    case "needs_summaries":
      return failed(t("courses.needsSummaries"));
    case "not_found":
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}

export async function removeCourse(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { locale, supabase, t } = await trainerAction(formData);
  const result = await deleteCourse(supabase, text(formData, "id"));
  switch (result) {
    case "deleted":
      await leaveNotice(t("courses.deleted"));
      return redirect({ href: routes.trainerCourses, locale });
    case "has_learners":
      return failed(t("courses.hasLearners"));
    case "not_found":
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}

export async function reorderCourse(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const direction: Direction = text(formData, "direction") === "up" ? "up" : "down";
  const done = await moveCourse(supabase, text(formData, "id"), direction);
  refresh();
  if (!done) return failed(t("common.failed"));
  return succeeded(t("common.moved"));
}
