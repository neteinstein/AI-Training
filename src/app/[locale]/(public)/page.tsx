import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkedinLogoIcon } from "@phosphor-icons/react/dist/ssr/LinkedinLogo";
import { PlusCircleIcon } from "@phosphor-icons/react/dist/ssr/PlusCircle";
import { ArrowRight, ChevronDown, Mail } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { type CSSProperties, Suspense } from "react";
import { AreaCard } from "@/components/catalog/area-card";
import { CourseBrowser, CourseBrowserFallback } from "@/components/catalog/course-browser";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { HeroOrbit } from "@/components/illustrations/hero-orbit";
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
  const faqs = [
    "experience",
    "bring",
    "freeTier",
    "duration",
    "where",
    "language",
    "price",
    "private",
    "materials",
    "certified",
  ] as const;

  return (
    <>
      <section className="relative isolate overflow-x-clip">
        {/* The glow, dots and grain fade out before the next section, so it has no edge. */}
        <div className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
          <div className="aurora">
            <span />
            <span />
            <span />
          </div>
          <div className="dot-grid" />
          <div className="grain" />
        </div>
        <div
          className={cn(
            container,
            "grid items-center gap-x-10 gap-y-12 pt-10 pb-14 md:pt-20 md:pb-20 lg:grid-cols-[1.1fr_1fr]",
          )}
        >
          <div className="flex flex-col items-start gap-5 md:gap-7">
            <p className="rise border-border bg-card/60 inline-flex min-h-8 items-center gap-2.5 rounded-full border px-3.5 text-sm font-semibold backdrop-blur">
              <span
                aria-hidden="true"
                className="pulse-dot size-2 rounded-full bg-(--art-accent)"
              />
              {t("eyebrow")}
            </p>
            <h1
              className="rise font-heading text-[clamp(2.5rem,5.4vw,4.5rem)] leading-[1.03] font-extrabold tracking-[-0.035em] text-balance"
              style={{ "--rise-step": 1 } as CSSProperties}
            >
              {t.rich("title", {
                accent: (chunks) => (
                  <span className="text-gradient relative sm:whitespace-nowrap">
                    {chunks}
                    {/* A hand-drawn stroke under the words, drawn in once. */}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 200 14"
                      preserveAspectRatio="none"
                      fill="none"
                      className="absolute -bottom-[0.26em] left-0 h-[0.26em] w-full max-sm:hidden"
                    >
                      <path
                        d="M3 10C52 3 128 1.5 197 6"
                        pathLength={1}
                        stroke="var(--art-sun)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        className="draw-in"
                      />
                    </svg>
                  </span>
                ),
              })}
            </h1>
            <p
              className="rise text-muted-foreground max-w-[34em] text-[1.0625rem] leading-[1.6] text-pretty md:text-lg"
              style={{ "--rise-step": 2 } as CSSProperties}
            >
              {t("lead")}
            </p>
            <div
              className="rise flex flex-wrap items-center gap-x-7 gap-y-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch"
              style={{ "--rise-step": 3 } as CSSProperties}
            >
              <Link
                href={routes.homeSection("courses")}
                className={buttonClass({
                  className:
                    "group shadow-[0_12px_32px_-12px_var(--primary)] transition-[background-color,box-shadow,translate] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_var(--primary)] max-sm:min-h-13",
                })}
              >
                {t("seeCourses")}
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                />
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
          <div className="rise flex justify-center" style={{ "--rise-step": 4 } as CSSProperties}>
            <HeroOrbit areas={areas} className="max-w-[310px] sm:max-w-[440px] lg:max-w-[500px]" />
          </div>
        </div>
      </section>

      <section>
        <div className={cn(container, "flex flex-col gap-6 pt-4 pb-12 md:gap-8 md:pb-18")}>
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
                action={t("areas.missingAction")}
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
              {levels.map((level, index) => (
                <li
                  key={level.id}
                  // Each level sits a step further in than the one before: a staircase.
                  style={{ "--stair": index } as CSSProperties}
                  className="border-border bg-card flex items-center gap-4.5 rounded-2xl border px-5 py-5 transition-[translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-(--shadow-raised) md:px-6 lg:ml-[calc(var(--stair)*3.5rem)]"
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
                    {/* The name sits right next to it, so the photo needs no description.
                        The file is already cut to size, and the Cloudflare build has no
                        image service that would resize it anyway. */}
                    <span className="flex-none rounded-full bg-[conic-gradient(from_140deg,var(--primary),var(--art-accent),var(--art-sun),var(--primary))] p-[3px]">
                      <Image
                        src={trainer.photo}
                        alt=""
                        width={64}
                        height={64}
                        unoptimized
                        className="bg-accent border-card size-16 rounded-full border-[3px] object-cover"
                      />
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <h3 className="font-heading text-2xl leading-tight">{trainer.name}</h3>
                      <p className="text-muted-foreground text-[0.9375rem]">
                        {t(`trainers.roles.${trainer.role}`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6">
                    {/* Names the trainer for screen readers, which may list the links alone.
                        A label rather than hidden text: browsers treat a visually hidden span
                        as a separate block and read "LinkedIn , Name". */}
                    <a
                      href={trainer.linkedin}
                      className={trainerLink}
                      aria-label={`LinkedIn, ${trainer.name}`}
                    >
                      <LinkedinLogoIcon aria-hidden="true" weight="duotone" className="size-5" />
                      LinkedIn
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
          <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-x-10 gap-y-9 md:gap-y-10 lg:grid-cols-3">
            {steps.map((step) => (
              <li key={step} className="relative flex flex-col gap-3">
                {step < steps.length ? (
                  <span
                    aria-hidden="true"
                    className="border-primary/35 absolute top-[2.4rem] right-[-1.75rem] left-[7.25rem] hidden border-t-2 border-dashed lg:block"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className="numeral-outline font-heading text-[5rem] leading-[0.95] font-extrabold tracking-[-0.04em]"
                >
                  {String(step).padStart(2, "0")}
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

      <section id={homeSections.faq} className="scroll-mt-4">
        <div
          className={cn(
            container,
            "grid items-start gap-x-16 gap-y-6 py-12 md:gap-y-8 md:py-18 lg:grid-cols-2",
          )}
        >
          <div className="flex flex-col gap-3 lg:sticky lg:top-8">
            <h2 className={sectionTitle}>{t("faq.title")}</h2>
            <p className="text-muted-foreground max-w-[28em]">
              {t.rich("faq.lead", {
                link: (chunks) => (
                  <Link
                    href={routes.homeSection("contact")}
                    className="text-primary hover:text-primary-hover font-medium underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((key) => (
              <details
                key={key}
                className="group border-border bg-card overflow-hidden rounded-2xl border"
              >
                <summary className="hover:bg-muted/60 flex min-h-15 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 transition-colors md:px-6 [&::-webkit-details-marker]:hidden">
                  <span className="font-heading text-lg leading-[1.3]">
                    {t(`faq.items.${key}.question`)}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="text-muted-foreground size-5 flex-none transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="text-muted-foreground px-5 pb-5 text-[0.9375rem] leading-[1.6] md:px-6">
                  {t(`faq.items.${key}.answer`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        id={homeSections.contact}
        className="flex flex-1 scroll-mt-4 items-center py-10 md:py-16"
      >
        <div className={container}>
          {/* Dark in both themes, so the page ends on a strong note. data-theme gives this
              panel the dark tokens; its own text and background colour then pick them up. */}
          <div
            data-theme="dark"
            className="bg-background text-foreground border-border relative isolate overflow-hidden rounded-[2rem] border"
          >
            <div className="aurora">
              <span />
              <span />
              <span />
            </div>
            <div className="grain" />
            <div className="grid items-start gap-x-16 gap-y-8 px-5 py-10 sm:px-8 md:gap-y-10 md:px-12 md:py-14 lg:grid-cols-2">
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
          </div>
        </div>
      </section>
    </>
  );
}
