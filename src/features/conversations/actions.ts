"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { ActionState } from "@/lib/actions/state";
import { fieldErrors, text } from "@/lib/actions/validation";
import { requireUser } from "@/lib/dal/session";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MESSAGE_MAX } from "./constants";
import { sendCourseMessage } from "./operations";
import { messageSchema } from "./schemas";

/**
 * A learner writes to the trainers of a course. For anyone signed in; the database decides
 * whether this person may write about this course (they are in it, and it is open to them).
 */
export async function sendMessage(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Conversation" });
  const tv = await getTranslations({ locale, namespace: "Validation" });
  await requireUser(locale);

  const values = { body: text(formData, "body") };
  const parsed = messageSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error, tv, { max: MESSAGE_MAX }),
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const result = await sendCourseMessage(supabase, text(formData, "course_id"), parsed.data.body);
  switch (result) {
    case "sent":
      // The message is now part of the page.
      refresh();
      return { status: "success", message: t("sent") };
    case "invalid":
      return {
        status: "error",
        fieldErrors: { body: tv("tooLong", { max: MESSAGE_MAX }) },
        values,
      };
    case "not_found":
      return { status: "error", message: t("gone"), values };
    case "denied":
      return { status: "error", message: t("trainersAnswer"), values };
    default:
      return { status: "error", message: t("failed"), values };
  }
}
