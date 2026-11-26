import "server-only";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { siteUrl } from "@/config/site";
import { requireTrainer } from "@/lib/dal/session";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NOTICE_COOKIE, type ActionState, type Notice } from "./state";

/**
 * What every back-office action starts with: the language of the form, the proof that the
 * caller is a trainer, their own database client (so Row Level Security applies as well),
 * and the translations for messages.
 *
 * Server Actions can be called by anyone who can reach the site, so this check is what
 * protects them, not the fact that the buttons only appear in the back-office.
 */
export async function trainerAction(formData: FormData) {
  const locale = localeFromForm(formData);
  const user = await requireTrainer(locale);
  const [supabase, t, tv] = await Promise.all([
    createSupabaseServerClient(),
    getTranslations({ locale, namespace: "Trainer" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  return { locale, user, supabase, t, tv };
}

export const succeeded = (message?: string, extra?: Partial<ActionState>): ActionState => ({
  status: "success",
  message,
  ...extra,
});

export const failed = (message: string, extra?: Partial<ActionState>): ActionState => ({
  status: "error",
  message,
  ...extra,
});

/** Leaves a message for the page the action is about to redirect to. */
export async function leaveNotice(message: string, status: Notice["status"] = "success") {
  const store = await cookies();
  store.set(NOTICE_COOKIE, JSON.stringify({ status, message } satisfies Notice), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    // Read and removed by the page's own script; it only ever holds interface text.
    httpOnly: false,
    secure: siteUrl.startsWith("https://"),
  });
}
