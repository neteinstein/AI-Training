import { ArrowRight, CalendarDays, ChevronRight, Clock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AreaChip } from "@/components/catalog/area-chip";
import { CourseCard } from "@/components/catalog/course-card";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { container } from "@/components/layout/container";
import { Markdown } from "@/components/markdown/markdown";
import { buttonClass } from "@/components/ui/button";
import { htmlLang } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getCatalog, getPublishedCourse } from "@/lib/dal/catalog";
import { dayToDate, formatDays } from "@/lib/dates";
import { routes } from "@/lib/routes";
import { localizedAlternates } from "@/lib/seo";
import { cn } from "@/lib/utils";

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
  const format = await getFormatter();
  const duration =
    course.durationHours !== null ? tCatalog("hours", { hours: course.durationHours }) : null;
  // A calendar day, not an instant: shown in UTC so it never shifts.
  const date = course.startsOn
    ? format.dateTime(dayToDate(course.startsOn), { dateStyle: "long", timeZone: "UTC" })
    : null;
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
          {date ? (
            <span className="text-muted-foreground inline-flex items-center gap-2 text-[0.9375rem]">
              <CalendarDays aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              <span className="sr-only">{t("date")}: </span>
              <time dateTime={course.startsOn ?? undefined}>{date}</time>
            </span>
          ) : null}
          {course.location ? (
            <span className="text-muted-foreground inline-flex items-center gap-2 text-[0.9375rem]">
              <MapPin aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
              <span className="sr-only">{t("location")}: </span>
              {course.location}
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
          {course.upcomingEditions.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-[0.9375rem] font-semibold">{t("upcoming")}</h3>
              <ul className="flex list-none flex-col gap-2">
                {course.upcomingEditions.map((edition) => (
                  <li
                    key={edition.id}
                    className="bg-muted flex items-start gap-3 rounded-xl px-3.5 py-2.5"
                  >
                    <CalendarDays
                      aria-hidden="true"
                      className="text-primary mt-0.5 size-[18px] flex-none"
                      strokeWidth={1.75}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold break-words">{edition.name}</span>
                      <span className="text-muted-foreground text-[0.9375rem]">
                        {formatDays(format, edition.startsOn, edition.endsOn)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
            {date ? (
              <>
                <dt>{t("date")}</dt>
                <dd>
                  <time dateTime={course.startsOn ?? undefined}>{date}</time>
                </dd>
              </>
            ) : null}
            {course.location ? (
              <>
                <dt>{t("location")}</dt>
                <dd className="break-words">{course.location}</dd>
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
