"use server";

import type { AuthError } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { fieldErrors, text } from "@/lib/actions/validation";
import { getCurrentUser } from "@/lib/dal/session";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { homeForRole, routes } from "@/lib/routes";
import { safeNextPath } from "@/lib/security/safe-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  emailSchema,
  isConfirmType,
  PASSWORD_MIN_LENGTH,
  setPasswordSchema,
  signInSchema,
} from "./schemas";

type SignInMessage = "signIn.invalid" | "signIn.notConfirmed" | "signIn.tooMany" | "generic";

function signInMessage(error: AuthError | null): SignInMessage {
  if (error?.code === "invalid_credentials") return "signIn.invalid";
  if (error?.code === "email_not_confirmed") return "signIn.notConfirmed";
  if (error?.status === 429) return "signIn.tooMany";
  return "generic";
}

export async function signIn(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Auth" });
  const tv = await getTranslations({ locale, namespace: "Validation" });
  const values = { email: text(formData, "email").trim() };

  const parsed = signInSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error, tv), values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { status: "error", message: t(signInMessage(error)), values };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, locale")
    .eq("id", data.user.id)
    .maybeSingle();
  const role = profile?.role ?? "learner";

  // The language the user just signed in with becomes their preference. A database trigger
  // copies it to the sign-in account, which is where the email templates read it.
  if (profile && profile.locale !== locale) {
    await supabase.from("profiles").update({ locale }).eq("id", data.user.id);
  }

  const home = homeForRole(role);
  let next = safeNextPath(formData.get("next"), home);
  if (role !== "trainer" && (next === routes.trainer || next.startsWith(`${routes.trainer}/`))) {
    next = home;
  }

  return redirect({ href: next, locale });
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = localeFromForm(formData);
  const supabase = await createSupabaseServerClient();
  // "local" ends this browser's session only, not the user's other devices.
  await supabase.auth.signOut({ scope: "local" });
  redirect({ href: routes.home, locale });
}

export async function requestPasswordReset(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Auth" });
  const tv = await getTranslations({ locale, namespace: "Validation" });
  const values = { email: text(formData, "email").trim() };

  const parsed = emailSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error, tv), values };
  }

  const supabase = await createSupabaseServerClient();
  // The answer is the same whether or not the address has an account.
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  return { status: "success", message: t("forgot.sent") };
}

/**
 * Consumes the one-time token of an emailed link. It runs only when the person presses
 * "Continue", never on page load, so mail scanners that open links cannot use the token up.
 */
export async function confirmLink(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Auth" });
  const tokenHash = text(formData, "token_hash");
  const type = text(formData, "type");

  if (!tokenHash || !isConfirmType(type)) {
    return { status: "error", message: t("confirm.expiredText") };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) {
    return { status: "error", message: t("confirm.expiredText") };
  }

  if (type === "invite" || type === "recovery") {
    return redirect({ href: routes.setPassword, locale });
  }
  return redirect({ href: routes.learn, locale });
}

export async function setPassword(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Auth" });
  const tv = await getTranslations({ locale, namespace: "Validation" });

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: t("setPassword.sessionMissing") };
  }

  const parsed = setPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error, tv, { min: PASSWORD_MIN_LENGTH }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { locale },
  });
  if (error) {
    if (error.code === "same_password") {
      return { status: "error", message: t("setPassword.samePassword") };
    }
    if (error.code === "weak_password") {
      return { status: "error", message: t("setPassword.weak", { min: PASSWORD_MIN_LENGTH }) };
    }
    return { status: "error", message: t("generic") };
  }

  if (user.locale !== locale) {
    await supabase.from("profiles").update({ locale }).eq("id", user.id);
  }

  return redirect({ href: homeForRole(user.role), locale });
}
