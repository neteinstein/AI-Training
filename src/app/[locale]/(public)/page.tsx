import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/ssr/LinkedinLogo";
import { PlusCircleIcon } from "@phosphor-icons/react/dist/ssr/PlusCircle";
import { ArrowRight, Mail } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AreaCard } from "@/components/catalog/area-card";
import { CourseBrowser, CourseBrowserFallback } from "@/components/catalog/course-browser";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { HeroIllustration } from "@/components/illustrations/hero";
import { container, sectionTitle } from "@/components/layout/container";
import { buttonClass } from "@/components/ui/button";
import { siteConfig, trainers } from "@/config/site";
import { RequestForm } from "@/features/requests/request-form";
import { Link } from "@/i18n/navigation";
import { getCatalog } from "@/lib/dal/catalog";
import { homeSections, routes } from "@/lib/routes";
import { localizedAlternates } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: localizedAlternates("/", locale) };
}

const COURSES_ON_HOME = 6;

/** "Pedro Vicente" -> "PV": first and last name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return [words[0], words.length > 1 ? words.at(-1) : ""].map((word) => word?.[0] ?? "").join("");
}

/** "https://www.example.org/" -> "example.org", for showing a website's address. */
function siteLabel(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

const trainerLink =
  "text-primary hover:text-primary-hover inline-flex min-h-11 items-center gap-2 font-semibold no-underline";

export default async function HomePage() {
  const locale = await getLocale();
  const t = await getTranslations("Home");
  const { areas, levels, courses } = await getCatalog(locale);

  const browser = {
    courses,
    areas: areas.filter((area) => area.courseCount > 0),
    levels,
    limit: COURSES_ON_HOME,
    heading: (
      <div className="flex flex-col gap-2">
        <h2 className={sectionTitle}>{t("courses.title")}</h2>
        <p className="text-muted-foreground">{t("courses.lead")}</p>
      </div>
    ),
  };
  const steps = [1, 2, 3] as const;

  return (
    <>
      <section
        className={cn(
          container,
          "grid items-center gap-x-14 gap-y-7 pt-9 pb-10 md:pt-22 md:pb-24 lg:grid-cols-2",
        )}
      >
        <div className="flex flex-col items-start gap-5 md:gap-6">
          <p className="bg-accent text-accent-foreground inline-flex min-h-8 items-center rounded-full px-3.5 text-sm font-semibold">
            {t("eyebrow")}
          </p>
          <h1 className="font-heading text-[clamp(2.25rem,4.4vw,3.5rem)] leading-[1.08] text-balance">
            {t("title")}
          </h1>
          <p className="text-muted-foreground max-w-[34em] text-[1.0625rem] leading-[1.6] text-pretty md:text-lg">
            {t("lead")}
          </p>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
            <Link
              href={routes.homeSection("courses")}
              className={buttonClass({ className: "max-sm:min-h-13" })}
            >
              {t("seeCourses")}
            </Link>
            <Link
              href={routes.homeSection("contact")}
              className="text-primary hover:text-primary-hover group inline-flex min-h-11 items-center justify-center gap-2 font-semibold no-underline"
            >
              {t("requestInfo")}
              <ArrowRight
                aria-hidden="true"
                className="size-[18px] transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
        <div className="flex justify-center">
          <HeroIllustration className="h-auto w-full max-w-[264px] lg:max-w-[440px]" />
        </div>
      </section>

      <section className="border-border border-t">
        <div className={cn(container, "flex flex-col gap-6 py-12 md:gap-8 md:py-18")}>
          <div className="flex flex-col gap-2">
            <h2 className={sectionTitle}>{t("areas.title")}</h2>
            <p className="text-muted-foreground">{t("areas.lead")}</p>
          </div>
          <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 md:gap-6">
            {areas.map((area) => (
              <li key={area.id} className="flex [&>a]:w-full">
                <AreaCard
                  href={routes.coursesIn(area.slug)}
                  title={area.name}
                  description={area.description}
                  icon={area.icon}
                  color={area.color}
                  action={t("areas.courseCount", { count: area.courseCount })}
                />
              </li>
            ))}
            <li className="flex [&>a]:w-full">
              <AreaCard
                dashed
                href={routes.homeSection("contact")}
                title={t("areas.missingTitle")}
                description={t("areas.missingText")}
                icon={<PlusCircleIcon aria-hidden="true" weight="duotone" className="size-9" />}
                action={t("requestInfo")}
              />
            </li>
          </ul>
        </div>
      </section>

      {levels.length > 0 ? (
        <section className="bg-muted">
          <div
            className={cn(
              container,
              "grid items-center gap-x-14 gap-y-6 py-12 md:gap-y-10 md:py-16 lg:grid-cols-2",
            )}
          >
            <div className="flex flex-col gap-3">
              <h2 className={sectionTitle}>{t("levels.title", { count: levels.length })}</h2>
              <p className="text-muted-foreground max-w-[30em]">{t("levels.lead")}</p>
            </div>
            <ul className="flex list-none flex-col gap-3 md:gap-4">
              {levels.map((level) => (
                <li
                  key={level.id}
                  className="border-border bg-card flex items-center gap-4.5 rounded-2xl border px-5 py-5 md:px-6"
                >
                  <span
                    aria-hidden="true"
                    className="bg-accent flex size-13 flex-none items-center justify-center rounded-[14px]"
                  >
                    <LevelGlyph step={level.step} size={28} onTint />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="font-heading text-xl leading-[1.3]">{level.name}</h3>
                    {level.description ? (
                      <p className="text-muted-foreground text-[0.9375rem] leading-normal">
                        {level.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section id={homeSections.courses} className="scroll-mt-4">
        <div className={cn(container, "py-12 md:py-20")}>
          <Suspense fallback={<CourseBrowserFallback {...browser} />}>
            <CourseBrowser {...browser} />
          </Suspense>
        </div>
      </section>

      {trainers.length > 0 ? (
        <section className="border-border border-t">
          <div className={cn(container, "flex flex-col gap-6 py-12 md:gap-8 md:py-18")}>
            <div className="flex flex-col gap-2">
              <h2 className={sectionTitle}>{t("trainers.title")}</h2>
              <p className="text-muted-foreground">{t("trainers.lead")}</p>
            </div>
            <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4 md:gap-6">
              {trainers.map((trainer) => (
                <li
                  key={trainer.name}
                  className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-7"
                >
                  <div className="flex items-center gap-4.5">
                    <span
                      aria-hidden="true"
                      className="bg-accent text-accent-foreground font-heading flex size-16 flex-none items-center justify-center rounded-full text-2xl"
                    >
                      {initials(trainer.name)}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <h3 className="font-heading text-2xl leading-tight">{trainer.name}</h3>
                      <p className="text-muted-foreground text-[0.9375rem]">
                        {t(`trainers.roles.${trainer.role}`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6">
                    <a href={trainer.linkedin} className={trainerLink}>
                      <LinkedinLogoIcon aria-hidden="true" weight="duotone" className="size-5" />
                      LinkedIn
                      {/* Names the trainer for screen readers, which may list the links alone. */}
                      <span className="sr-only">, {trainer.name}</span>
                    </a>
                    <a href={trainer.website} className={trainerLink}>
                      <GlobeIcon aria-hidden="true" weight="duotone" className="size-5" />
                      {siteLabel(trainer.website)}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section id={homeSections.howItWorks} className="bg-muted scroll-mt-4">
        <div className={cn(container, "flex flex-col gap-7 py-12 md:gap-9 md:py-18")}>
          <h2 className={sectionTitle}>{t("how.title")}</h2>
          <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-x-10 gap-y-7 md:gap-y-8">
            {steps.map((step) => (
              <li key={step} className="flex flex-col gap-3">
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground font-heading flex size-12 items-center justify-center rounded-full text-[1.375rem]"
                >
                  {step}
                </span>
                <h3 className="font-heading text-[1.375rem] leading-tight">
                  {t(`how.step${step}Title`)}
                </h3>
                <p className="text-muted-foreground text-[0.9375rem] leading-[1.55]">
                  {t(`how.step${step}Text`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id={homeSections.contact} className="flex flex-1 scroll-mt-4 items-center">
        <div
          className={cn(
            container,
            "grid items-start gap-x-16 gap-y-6 py-12 md:gap-y-10 md:py-20 lg:grid-cols-2",
          )}
        >
          <div className="flex flex-col gap-4">
            <h2 className={sectionTitle}>{t("contact.title")}</h2>
            <p className="text-muted-foreground max-w-[28em]">{t("contact.lead")}</p>
            {siteConfig.contactEmail ? (
              <p className="text-muted-foreground mt-2 flex items-center gap-2.5">
                <Mail aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
                <a
                  href={`mailto:${siteConfig.contactEmail}`}
                  className="text-primary hover:text-primary-hover font-medium break-all"
                >
                  {siteConfig.contactEmail}
                </a>
              </p>
            ) : null}
          </div>
          <RequestForm courses={courses.map(({ id, title }) => ({ id, title }))} />
        </div>
      </section>
    </>
  );
}
