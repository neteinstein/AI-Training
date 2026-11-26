"use server";

import { getTranslations } from "next-intl/server";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/constants";
import { profileSchema } from "@/features/users/schemas";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { fieldErrors, text } from "@/lib/actions/validation";
import { requireUser } from "@/lib/dal/session";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { routes } from "@/lib/routes";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changePassword, updateProfile } from "./operations";
import { passwordChangeSchema } from "./schemas";

/** Saves the signed-in person's own name and language. */
export async function saveProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Account" });
  const tv = await getTranslations({ locale, namespace: "Validation" });
  const tAuth = await getTranslations({ locale, namespace: "Auth" });
  const user = await requireUser(locale);

  const values = { full_name: text(formData, "full_name"), language: text(formData, "language") };
  const parsed = profileSchema.safeParse({ full_name: values.full_name, locale: values.language });
  if (!parsed.success) {
    const { locale: language, ...errors } = fieldErrors(parsed.error, tv);
    return {
      status: "error",
      message: t("checkFields"),
      fieldErrors: language ? { ...errors, language } : errors,
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const saved = await updateProfile(supabase, user.id, parsed.data);
  if (!saved) return { status: "error", message: tAuth("generic"), values };

  // A new language applies at once: show the page again in it.
  if (parsed.data.locale !== locale) {
    return redirect({ href: routes.account, locale: parsed.data.locale });
  }
  return { status: "success", message: t("saved"), values };
}

/** Changes the signed-in person's password, after checking they know the current one. */
export async function changeOwnPassword(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Account" });
  const tv = await getTranslations({ locale, namespace: "Validation" });
  const tAuth = await getTranslations({ locale, namespace: "Auth" });
  const user = await requireUser(locale);

  const parsed = passwordChangeSchema.safeParse({
    current: text(formData, "current"),
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: t("checkFields"),
      fieldErrors: fieldErrors(parsed.error, tv, { min: PASSWORD_MIN_LENGTH }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const result = await changePassword(supabase, createSupabasePublicClient(), {
    email: user.email,
    current: parsed.data.current,
    next: parsed.data.password,
  });

  switch (result) {
    case "ok":
      return { status: "success", message: t("changed") };
    case "wrong_password":
      return { status: "error", fieldErrors: { current: t("wrong") } };
    case "same_password":
      return { status: "error", fieldErrors: { password: t("same") } };
    case "weak":
      return {
        status: "error",
        fieldErrors: { password: t("weak", { min: PASSWORD_MIN_LENGTH }) },
      };
    default:
      return { status: "error", message: tAuth("generic") };
  }
}
