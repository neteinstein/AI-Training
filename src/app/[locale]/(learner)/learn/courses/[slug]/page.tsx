import { ChevronDown, ChevronRight, Download, ExternalLink, EyeOff, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AreaChip } from "@/components/catalog/area-chip";
import { CourseFacts } from "@/components/catalog/course-card";
import { CourseWhenWhere } from "@/components/catalog/course-when-where";
import { AppHeader } from "@/components/layout/app-header";
import { MaterialIcon } from "@/components/materials/kind";
import { materialMeta } from "@/components/materials/meta";
import { htmlLang } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { fetchCourseContent } from "@/lib/dal/learner-queries";
import { requireUser } from "@/lib/dal/session";
import type { MaterialItem } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/learn/courses/[slug]">;

async function loadCourse(params: Props["params"]) {
  const { slug } = await params;
  const locale = await getLocale();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const content = await fetchCourseContent(supabase, user, slug, locale);
  return { slug, locale, user, content };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { content } = await loadCourse(params);
  return { title: content?.course.title };
}

export default async function LearnCoursePage({ params }: Props) {
  const { slug, locale, user, content } = await loadCourse(params);
  if (!content) notFound();

  const t = await getTranslations("Learn");
  const tm = await getTranslations("Materials");
  const { course, modules } = content;
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
        </div>
      </div>

      <main
        id="content"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 pt-5 pb-8"
      >
        {user.role === "trainer" ? (
          <div className="bg-highlight-tint mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-4 py-3 text-[0.9375rem]">
            <p>{t("previewNote")}</p>
            <Link
              href={routes.trainerCourseContent(course.id)}
              className="text-highlight-foreground inline-flex min-h-11 items-center gap-1.5 font-semibold no-underline hover:underline"
            >
              <Pencil aria-hidden="true" className="size-4" />
              {t("editCourse")}
            </Link>
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
                      slug={slug}
                      material={material}
                      meta={materialMeta(material, labels, locale)}
                      lang={
                        material.titleLang === locale ? undefined : htmlLang[material.titleLang]
                      }
                      hiddenLabel={t("hidden")}
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
  slug,
  material,
  meta,
  lang,
  hiddenLabel,
  downloadLabel,
  newTabLabel,
}: {
  slug: string;
  material: MaterialItem;
  meta: string;
  lang?: string;
  hiddenLabel: string;
  downloadLabel: string;
  newTabLabel: string;
}) {
  const body = (
    <>
      <MaterialIcon material={material} />
      <span className="flex min-w-0 flex-col">
        <span lang={lang} className="text-[0.9375rem] leading-[1.35] font-semibold break-words">
          {material.title}
        </span>
        <span className="text-muted-foreground text-[0.8125rem]">{meta}</span>
      </span>
      {material.isPublished ? null : (
        <span className="bg-highlight-tint text-highlight-foreground ml-auto inline-flex min-h-[26px] flex-none items-center gap-1 rounded-full px-2.5 text-xs font-semibold">
          <EyeOff aria-hidden="true" className="size-3.5" />
          {hiddenLabel}
        </span>
      )}
    </>
  );
  const rowClass =
    "text-foreground hover:text-primary flex min-h-17 min-w-0 flex-1 items-center gap-3 py-2 no-underline transition-colors";
  const endClass = "text-muted-foreground flex size-11 flex-none items-center justify-center";

  // A link goes straight to the other site: there is nothing more to show about it here.
  if (material.kind === "link" && material.url) {
    return (
      <a href={material.url} target="_blank" rel="noopener noreferrer" className={rowClass}>
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
      <Link href={routes.learnMaterial(slug, material.id)} className={rowClass}>
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
