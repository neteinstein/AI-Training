import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CourseBrowser, CourseBrowserFallback } from "@/components/catalog/course-browser";
import { container } from "@/components/layout/container";
import { getCatalog } from "@/lib/dal/catalog";
import { routes } from "@/lib/routes";
import { localizedAlternates } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Catalog");
  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates(routes.courses, locale),
  };
}

export default async function CoursesPage() {
  const locale = await getLocale();
  const t = await getTranslations("Catalog");
  const { areas, levels, courses } = await getCatalog(locale);

  const browser = {
    courses,
    areas: areas.filter((area) => area.courseCount > 0),
    levels,
    headingLevel: "h2" as const,
    heading: (
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-[clamp(2.125rem,3.6vw,3rem)] leading-[1.1] font-[550] tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg">{t("lead")}</p>
      </div>
    ),
  };

  return (
    <div className={cn(container, "pt-8 pb-16 md:pt-14 md:pb-24")}>
      <Suspense fallback={<CourseBrowserFallback {...browser} />}>
        <CourseBrowser {...browser} />
      </Suspense>
    </div>
  );
}
