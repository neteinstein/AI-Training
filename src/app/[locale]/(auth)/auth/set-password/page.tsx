import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CourseSummary } from "@/components/catalog/course-summary";
import { buttonClass } from "@/components/ui/button";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { Link } from "@/i18n/navigation";
import { fetchMyCourses } from "@/lib/dal/learner-queries";
import { getCurrentUser } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.setPassword");
  return { title: t("title") };
}

export default async function SetPasswordPage() {
  const t = await getTranslations("Auth.setPassword");

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-[2rem] leading-[1.15]">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Reading the session happens at request time, behind this boundary. */}
      <Suspense>
        <SetPasswordGate />
      </Suspense>
    </>
  );
}

async function SetPasswordGate() {
  const t = await getTranslations("Auth.setPassword");
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="bg-destructive-tint text-destructive rounded-xl px-4 py-3 font-medium"
        >
          {t("sessionMissing")}
        </p>
        <Link href={routes.forgotPassword} className={buttonClass({ variant: "outline" })}>
          {t("requestNewLink")}
        </Link>
      </div>
    );
  }

  // What the account gives access to: reassuring on a first visit, and a reminder otherwise.
  const supabase = await createSupabaseServerClient();
  const courses = await fetchMyCourses(supabase, user.id, await getLocale());

  return (
    <>
      {courses.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-semibold">
            {t("yourCourses", { count: courses.length })}
          </h2>
          <ul className="flex list-none flex-col gap-3">
            {courses.slice(0, 3).map((course) => (
              <li key={course.id}>
                <CourseSummary course={course} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <SetPasswordForm email={user.email} />
    </>
  );
}
