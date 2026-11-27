import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Download,
  ExternalLink,
  EyeOff,
  Pencil,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AreaChip } from "@/components/catalog/area-chip";
import { CourseFacts } from "@/components/catalog/course-card";
import { CourseWhenWhere } from "@/components/catalog/course-when-where";
import { AppHeader } from "@/components/layout/app-header";
import { MaterialIcon } from "@/components/materials/kind";
import { ProgressBar } from "@/components/materials/progress-bar";
import { materialMeta } from "@/components/materials/meta";
import { htmlLang } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { fetchCourseContent } from "@/lib/dal/learner-queries";
import { requireUser } from "@/lib/dal/session";
import type { MaterialItem } from "@/lib/dal/types";
import { formatDays } from "@/lib/dates";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Props = PageProps<"/[locale]/learn/courses/[slug]">;

/** `asked` is the page's query: a trainer may name the edition whose view they want. */
async function loadCourse(params: Props["params"], asked?: Props["searchParams"]) {
  const { slug } = await params;
  const locale = await getLocale();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const edition = (await asked)?.edition;
  const content = await fetchCourseContent(supabase, user, slug, locale, {
    editionId: typeof edition === "string" ? edition : null,
  });
  return { slug, locale, user, content };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { content } = await loadCourse(params);
  return { title: content?.course.title };
}

export default async function LearnCoursePage({ params, searchParams }: Props) {
  const { slug, locale, user, content } = await loadCourse(params, searchParams);
  if (!content) notFound();

  const t = await getTranslations("Learn");
  const tm = await getTranslations("Materials");
  const format = await getFormatter();
  const { course, modules, edition, editions, progress } = content;
  const isTrainer = user.role === "trainer";
  // A trainer's links keep the edition being previewed; a learner's never name one.
  const previewEdition = isTrainer ? edition?.id : undefined;
  const editionDays = edition ? formatDays(format, edition.startsOn, edition.endsOn) : null;
  const editionName = (id: string) => editions.find((entry) => entry.id === id)?.name ?? "";
  const labels = {
    kind: (kind: MaterialItem["kind"]) => tm(`kind.${kind}`),
    provider: (provider: NonNullable<MaterialItem["embed"]>["provider"]) =>
      tm(`provider.${provider}`),
    newTab: tm("newTab"),
  };

  return (
    <>
      <AppHeader user={user} back={{ href: routes.learn, label: t("backToCourses") }} />

      <div className="bg-muted">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-5 py-5 sm:py-8">
          <AreaChip area={course.area} />
          <h1 className="font-heading text-[1.75rem] leading-[1.2] sm:text-4xl">{course.title}</h1>
          <CourseWhenWhere course={course} />
          <CourseFacts course={course} />
          {/* Not for the edition a course starts with, left as it was: there is nothing to say. */}
          {edition && !edition.isPlain ? (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <UsersRound aria-hidden="true" className="size-[18px] flex-none" />
              <span className="sr-only">{t("edition")}: </span>
              <span className="text-foreground font-semibold break-words">{edition.name}</span>
              {editionDays ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{editionDays}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {progress ? (
            <ProgressBar
              done={progress.done}
              total={progress.total}
              label={t("progress", progress)}
              className="mt-1 w-full max-w-sm"
            />
          ) : null}
        </div>
      </div>

      <main
        id="content"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 pt-5 pb-8"
      >
        {isTrainer ? (
          <div className="bg-highlight-tint mb-2 flex flex-col gap-2 rounded-2xl px-4 py-3 text-[0.9375rem]">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p>{edition ? t("previewNoteEdition", { name: edition.name }) : t("previewNote")}</p>
              <Link
                href={routes.trainerCourseContent(course.id, previewEdition)}
                className="text-highlight-foreground inline-flex min-h-11 items-center gap-1.5 font-semibold no-underline hover:underline"
              >
                <Pencil aria-hidden="true" className="size-4" />
                {t("editCourse")}
              </Link>
            </div>
            {/* With a single edition every learner sees the same. */}
            {editions.length > 1 ? (
              <nav aria-label={t("previewEdition")} className="flex flex-wrap items-center gap-2">
                {[{ id: null, name: t("wholeCourse") }, ...editions].map((entry) => {
                  const current = (entry.id ?? undefined) === previewEdition;
                  return (
                    <Link
                      key={entry.id ?? "all"}
                      href={routes.learnCourse(slug, entry.id)}
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold no-underline transition-colors",
                        current
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      {entry.name}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
          </div>
        ) : null}

        <h2 className="text-muted-foreground mx-1 text-[0.8125rem] font-semibold tracking-[0.06em] uppercase">
          {t("modules")}
        </h2>

        {modules.length === 0 ? (
          <p className="text-muted-foreground mx-1">{t("noModules")}</p>
        ) : null}

        {modules.map((module, index) => (
          <details
            key={module.id}
            open={index === 0}
            className="group border-border bg-card overflow-hidden rounded-2xl border"
          >
            <summary className="hover:bg-muted/60 flex min-h-15 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 transition-colors [&::-webkit-details-marker]:hidden">
              <span className="flex flex-col">
                <span className="font-heading text-lg leading-[1.3]">
                  {index + 1}. {module.title}
                </span>
                <span className="text-muted-foreground text-[0.8125rem]">
                  {t("materialCount", { count: module.materials.length })}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-5 flex-none transition-transform group-open:rotate-180"
              />
            </summary>
            {module.description ? (
              <p className="border-border text-muted-foreground border-t px-4 py-3 text-[0.9375rem]">
                {module.description}
              </p>
            ) : null}
            {module.materials.length > 0 ? (
              <ul className="border-border list-none border-t py-1">
                {module.materials.map((material, position) => (
                  <li
                    key={material.id}
                    className={
                      position === 0
                        ? "flex items-center gap-1 pr-2 pl-4"
                        : "border-border/60 flex items-center gap-1 border-t pr-2 pl-4"
                    }
                  >
                    <MaterialRow
                      href={routes.learnMaterial(slug, material.id, previewEdition)}
                      material={material}
                      onlyIn={
                        // Looking at the whole course, a trainer is told what only one edition has.
                        isTrainer && !edition && material.editionId
                          ? t("onlyIn", { name: editionName(material.editionId) })
                          : undefined
                      }
                      meta={materialMeta(material, labels, locale)}
                      lang={
                        material.titleLang === locale ? undefined : htmlLang[material.titleLang]
                      }
                      hiddenLabel={t("hidden")}
                      openedLabel={material.kind === "quiz" ? t("handedIn") : t("opened")}
                      downloadLabel={t("download", { title: material.title })}
                      newTabLabel={tm("newTab")}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ))}
      </main>
    </>
  );
}

/** One material in a module: the row opens it; files also have a direct download. */
function MaterialRow({
  href,
  material,
  onlyIn,
  meta,
  lang,
  hiddenLabel,
  openedLabel,
  downloadLabel,
  newTabLabel,
}: {
  /** The material's own page. */
  href: string;
  material: MaterialItem;
  /** "Only: January class", for a material of one edition shown among the whole course's. */
  onlyIn?: string;
  meta: string;
  lang?: string;
  hiddenLabel: string;
  openedLabel: string;
  downloadLabel: string;
  newTabLabel: string;
}) {
  const tag =
    "bg-highlight-tint text-highlight-foreground inline-flex min-h-[26px] items-center gap-1 rounded-full px-2.5 text-xs font-semibold";
  const body = (
    <>
      <MaterialIcon material={material} />
      <span className="flex min-w-0 flex-col">
        <span lang={lang} className="text-[0.9375rem] leading-[1.35] font-semibold break-words">
          {material.title}
        </span>
        <span className="text-muted-foreground text-[0.8125rem]">{meta}</span>
      </span>
      {onlyIn || !material.isPublished || material.isDone ? (
        <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {onlyIn ? <span className={cn(tag, "min-w-0 break-words")}>{onlyIn}</span> : null}
          {material.isPublished ? null : (
            <span className={cn(tag, "flex-none")}>
              <EyeOff aria-hidden="true" className="size-3.5" />
              {hiddenLabel}
            </span>
          )}
          {material.isDone ? (
            <span className="text-highlight flex flex-none items-center">
              <CircleCheck aria-hidden="true" className="size-5" />
              <span className="sr-only">{openedLabel}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
  const rowClass =
    "text-foreground hover:text-primary flex min-h-17 min-w-0 flex-1 items-center gap-3 py-2 no-underline transition-colors";
  const endClass = "text-muted-foreground flex size-11 flex-none items-center justify-center";

  // A link goes straight to the other site: there is nothing more to show about it here.
  if (material.kind === "link" && material.url) {
    return (
      // Through the site, which notes the opening and sends the browser on.
      <a
        href={routes.materialOpen(material.id)}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
      >
        {body}
        <span className="sr-only">({newTabLabel})</span>
        <span aria-hidden="true" className={`${endClass} ml-auto`}>
          <ExternalLink className="size-[18px]" />
        </span>
      </a>
    );
  }

  return (
    <>
      <Link href={href} className={rowClass}>
        {body}
      </Link>
      {material.kind === "file" ? (
        // A plain link: the answer is a file, not a page of the app.
        <a
          href={routes.materialDownload(material.id)}
          aria-label={downloadLabel}
          className="text-primary hover:bg-accent flex size-11 flex-none items-center justify-center rounded-lg transition-colors"
        >
          <Download aria-hidden="true" className="size-5" />
        </a>
      ) : (
        <span aria-hidden="true" className={endClass}>
          <ChevronRight className="size-[18px]" />
        </span>
      )}
    </>
  );
}
