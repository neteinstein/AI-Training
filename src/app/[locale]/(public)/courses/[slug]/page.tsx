import { ArrowRight, ChevronRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AreaChip } from "@/components/catalog/area-chip";
import { CourseCard } from "@/components/catalog/course-card";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { container } from "@/components/layout/container";
import { Markdown } from "@/components/markdown/markdown";
import { buttonClass } from "@/components/ui/button";
import { htmlLang } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getCatalog, getPublishedCourse } from "@/lib/dal/catalog";
import { routes } from "@/lib/routes";
import { localizedAlternates } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Stands in when no course is published yet: the build needs at least one address to check. */
const NO_COURSE_YET = "-";

/**
 * Published courses are rendered ahead of time. A course published later gets its page on the
 * first visit, and every page is refreshed as soon as a trainer changes the catalogue.
 */
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const { courses } = await getCatalog(params.locale === "en" ? "en" : "pt");
  return courses.length > 0
    ? courses.map((course) => ({ slug: course.slug }))
    : [{ slug: NO_COURSE_YET }];
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/courses/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const course = await getPublishedCourse(slug, locale);
  if (!course) return {};
  return {
    title: course.title,
    description: course.summary || undefined,
    alternates: localizedAlternates(routes.course(course.slug), locale),
  };
}

export default async function CoursePage({ params }: PageProps<"/[locale]/courses/[slug]">) {
  const { slug } = await params;
  const locale = await getLocale();
  const course = await getPublishedCourse(slug, locale);
  if (!course) notFound();

  const t = await getTranslations("Course");
  const tCatalog = await getTranslations("Catalog");
  const tNav = await getTranslations("Nav");
  const { courses } = await getCatalog(locale);
  const related = courses
    .filter((other) => other.area.id === course.area.id && other.id !== course.id)
    .slice(0, 3);
  const duration =
    course.durationHours !== null ? tCatalog("hours", { hours: course.durationHours }) : null;
  const translated = course.descriptionLang === locale;

  return (
    <div className={cn(container, "flex flex-col gap-6 pt-6 pb-16 md:pt-8 md:pb-20")}>
      <nav aria-label={t("breadcrumb")}>
        <ol className="text-muted-foreground flex list-none flex-wrap items-center gap-2 text-sm">
          <li className="flex items-center gap-2">
            <Link href={routes.courses} className="text-muted-foreground hover:text-foreground">
              {tNav("courses")}
            </Link>
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </li>
          <li>
            <Link
              href={routes.coursesIn(course.area.slug)}
              className="text-muted-foreground hover:text-foreground"
            >
              {course.area.name}
            </Link>
          </li>
        </ol>
      </nav>

      <header className="mb-4 flex flex-col gap-4 md:mb-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <AreaChip area={course.area} size="md" />
          <span className="inline-flex items-center gap-2 text-[0.9375rem] font-semibold">
            <LevelGlyph step={course.level.step} />
            {course.level.name}
          </span>
          {duration ? (
            <span className="text-muted-foreground inline-flex items-center gap-2 text-[0.9375rem]">
              <Clock aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              {duration}
            </span>
          ) : null}
        </div>
        <h1 className="font-heading text-[clamp(2.125rem,3.6vw,3rem)] leading-[1.1] text-balance">
          {course.title}
        </h1>
        {course.summary ? (
          <p className="text-muted-foreground max-w-[40em] text-lg leading-[1.6] text-pretty">
            {course.summary}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-start gap-x-14 gap-y-10">
        <section aria-label={t("about")} className="min-w-0 flex-[999_1_560px]">
          {course.description ? (
            <>
              {translated ? null : (
                <p className="bg-muted text-muted-foreground mb-5 rounded-xl px-4 py-3 text-[0.9375rem]">
                  {t(`onlyIn.${course.descriptionLang}`)}
                </p>
              )}
              <div lang={translated ? undefined : htmlLang[course.descriptionLang]}>
                <Markdown>{course.description}</Markdown>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">{t("noDescription")}</p>
          )}
        </section>

        <aside
          aria-label={t("joinLabel")}
          className="border-border bg-card flex flex-[1_1_320px] flex-col gap-5 rounded-2xl border p-7"
        >
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-2xl leading-tight">{t("joinTitle")}</h2>
            <p className="text-muted-foreground text-[0.9375rem] leading-[1.55]">{t("joinText")}</p>
          </div>
          <Link href={routes.requestInfo(course.id)} className={buttonClass()}>
            {t("joinAction")}
          </Link>
          <div className="border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-4 text-[0.9375rem]">
            <span className="text-muted-foreground">{t("haveInvite")}</span>
            <Link
              href={routes.login}
              className="text-primary hover:text-primary-hover group inline-flex min-h-11 items-center gap-1.5 font-semibold no-underline"
            >
              {t("signIn")}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
          <dl className="border-border [&_dt]:text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 border-t pt-5 text-[0.9375rem] [&_dd]:text-right [&_dd]:font-semibold">
            <dt>{t("area")}</dt>
            <dd>{course.area.name}</dd>
            <dt>{t("level")}</dt>
            <dd>{course.level.name}</dd>
            {duration ? (
              <>
                <dt>{t("duration")}</dt>
                <dd>{duration}</dd>
              </>
            ) : null}
          </dl>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-8 flex flex-col gap-6 md:mt-12">
          <h2 className="font-heading text-[1.625rem] leading-[1.3]">
            {t("related", { area: course.area.name })}
          </h2>
          <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-6">
            {related.map((other) => (
              <li key={other.id} className="flex">
                <CourseCard course={other} href={routes.course(other.slug)} className="w-full" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
