import { ArrowLeft, ArrowRight, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseCard } from "@/components/catalog/course-card";
import { AppHeader } from "@/components/layout/app-header";
import { ProgressBar } from "@/components/materials/progress-bar";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { fetchCoursesWithNewAnswers } from "@/lib/dal/conversation-queries";
import { fetchCoursesToPreview, fetchMyCourses } from "@/lib/dal/learner-queries";
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
  const isTrainer = user.role === "trainer";
  const [courses, newAnswers] = await Promise.all([
    // A trainer is enrolled in nothing: they come here to see the area as a learner would, so
    // they get every course, each as a learner of it would see it.
    isTrainer ? fetchCoursesToPreview(supabase, locale) : fetchMyCourses(supabase, user.id, locale),
    // The courses whose trainers have answered since the learner last looked. (A trainer has
    // no conversation of their own: they answer in the back-office.)
    isTrainer ? new Set<string>() : fetchCoursesWithNewAnswers(supabase, user.id),
  ]);

  return (
    <>
      <AppHeader user={user} className="max-w-5xl" />
      <main
        id="content"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10"
      >
        {isTrainer ? (
          <div className="bg-highlight-tint flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-4 py-3 text-[0.9375rem]">
            <p>{t("trainerNote")}</p>
            <Link
              href={routes.trainer}
              className="text-highlight-foreground inline-flex min-h-11 items-center gap-1.5 font-semibold no-underline hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t("backToBackOffice")}
            </Link>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">
            {t("greeting", { name: user.fullName || user.email })}
          </p>
          <h1 className="font-heading text-[1.75rem] leading-tight sm:text-4xl">{t("title")}</h1>
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
                  footer={
                    <>
                      {newAnswers.has(course.id) ? (
                        <span className="bg-highlight-tint text-highlight-foreground inline-flex min-h-6.5 items-center gap-1.5 self-start rounded-full px-2.5 text-xs font-semibold">
                          <MessagesSquare aria-hidden="true" className="size-3.5" />
                          {t("newAnswer")}
                        </span>
                      ) : null}
                      {course.progress ? (
                        <ProgressBar
                          done={course.progress.done}
                          total={course.progress.total}
                          label={t("progress", course.progress)}
                        />
                      ) : null}
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-input flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-dashed p-6 sm:p-8">
            <h2 className="font-heading text-2xl leading-tight">{t("emptyTitle")}</h2>
            <p className="text-muted-foreground max-w-[34em]">{t("emptyText")}</p>
            <Link
              href={isTrainer ? routes.trainerCourses : routes.courses}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              {isTrainer ? tAccount("backOffice") : t("browse")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
