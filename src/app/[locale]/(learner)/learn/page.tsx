import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseCard } from "@/components/catalog/course-card";
import { AppHeader } from "@/components/layout/app-header";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { fetchMyCourses } from "@/lib/dal/learner-queries";
import { requireUser } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Learn");
  return { title: t("title") };
}

export default async function LearnPage() {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const t = await getTranslations("Learn");
  const tAccount = await getTranslations("Account");
  const supabase = await createSupabaseServerClient();
  const courses = await fetchMyCourses(supabase, user.id, locale);

  return (
    <>
      <AppHeader user={user} className="max-w-5xl" />
      <main
        id="content"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10"
      >
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">
            {t("greeting", { name: user.fullName || user.email })}
          </p>
          <h1 className="font-heading text-[1.75rem] leading-tight font-[550] tracking-[-0.01em] sm:text-4xl">
            {t("title")}
          </h1>
        </div>

        {courses.length > 0 ? (
          <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4 sm:gap-6">
            {courses.map((course) => (
              <li key={course.id} className="flex">
                <CourseCard
                  course={course}
                  href={routes.learnCourse(course.slug)}
                  headingLevel="h2"
                  className="w-full"
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-input flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-dashed p-6 sm:p-8">
            <h2 className="font-heading text-2xl leading-tight font-semibold">{t("emptyTitle")}</h2>
            <p className="text-muted-foreground max-w-[34em]">{t("emptyText")}</p>
            <Link
              href={user.role === "trainer" ? routes.trainerCourses : routes.courses}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              {user.role === "trainer" ? tAccount("backOffice") : t("browse")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
