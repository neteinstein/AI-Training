import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Locale } from "@/config/site";
import { redirect } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: "learner" | "trainer";
  locale: Locale;
};

/**
 * The signed-in user, or null. The token is verified (not just decoded), and the role comes
 * from the database on every request, so a demoted or deleted account loses access at once.
 * Cached for the duration of one request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, locale")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    locale: profile.locale === "en" ? "en" : "pt",
  };
});

/** For pages and actions that need a signed-in user. Sends everyone else to the login page. */
export async function requireUser(locale: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    return redirect({ href: routes.login, locale });
  }
  return user;
}

/**
 * For the back-office. A signed-in learner gets "not found" rather than a hint that the page
 * exists.
 */
export async function requireTrainer(locale: Locale): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== "trainer") notFound();
  return user;
}
