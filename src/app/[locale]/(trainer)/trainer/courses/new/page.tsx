import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { EmptyState } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { CourseForm } from "@/features/courses/course-form";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerAreas, getTrainerLevels } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.courses");
  return { title: t("new") };
}

export default async function NewCoursePage() {
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.courses");
  const [areas, levels] = await Promise.all([getTrainerAreas(), getTrainerLevels()]);

  return (
    <PageFrame
      crumbs={[{ label: t("title"), href: routes.trainerCourses }, { label: t("new") }]}
      title={t("new")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("newLead")}</p>}
      narrow
    >
      {/* A course belongs to an area and a level, so those come first. */}
      {areas.length === 0 ? (
        <EmptyState
          action={
            <Link href={routes.trainerAreaNew} className={buttonClass({ size: "sm" })}>
              {t("goToAreas")}
            </Link>
          }
        >
          {t("noAreas")}
        </EmptyState>
      ) : levels.length === 0 ? (
        <EmptyState
          action={
            <Link href={routes.trainerLevelNew} className={buttonClass({ size: "sm" })}>
              {t("goToLevels")}
            </Link>
          }
        >
          {t("noLevels")}
        </EmptyState>
      ) : (
        <CourseForm
          areas={areas.map((area) => ({ id: area.id, name: area.name[locale] }))}
          levels={levels.map((level) => ({ id: level.id, name: level.name[locale] }))}
        />
      )}
    </PageFrame>
  );
}
