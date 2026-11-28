import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AreaChip } from "@/components/catalog/area-chip";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { Chip, courseStatusTone } from "@/components/trainer/chips";
import { PageFrame } from "@/components/trainer/page-frame";
import { EmptyState, MoveButtons, Row, RowList } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { reorderCourse } from "@/features/courses/actions";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { fetchTrainerCourses } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.courses");
  return { title: t("title") };
}

export default async function CoursesPage() {
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer");
  const format = await getFormatter();
  const courses = await fetchTrainerCourses(await createSupabaseServerClient(), locale);

  const newCourse = (label: string) => (
    <Link href={routes.trainerCourseNew} className={buttonClass({ size: "sm" })}>
      <Plus aria-hidden="true" />
      {label}
    </Link>
  );

  return (
    <PageFrame
      crumbs={[{ label: t("courses.title") }]}
      title={t("courses.title")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("courses.lead")}</p>}
      headerAside={newCourse(t("courses.new"))}
    >
      {courses.length === 0 ? (
        <EmptyState action={newCourse(t("courses.emptyAction"))}>{t("courses.empty")}</EmptyState>
      ) : (
        <RowList label={t("courses.title")}>
          {courses.map((course, index) => (
            <Row key={course.id} className="py-3">
              <span className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1.5">
                <Link
                  href={routes.trainerCourseContent(course.id)}
                  className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                >
                  {course.title}
                </Link>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                  <AreaChip area={course.area} />
                  <span className="text-foreground inline-flex items-center gap-1.5 font-semibold">
                    <LevelGlyph step={course.level.step} size={16} />
                    {course.level.name}
                  </span>
                  <span>{t("courses.learnerCount", { count: course.learnerCount })}</span>
                  <span className="break-words">
                    {course.trainers.length > 0
                      ? t("courses.taughtBy", { names: format.list(course.trainers) })
                      : t("courses.noTrainer")}
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {course.gaps.map((gap) => (
                  <Chip key={gap} tone="attention">
                    {t("common.missing", { language: gap.toUpperCase() })}
                  </Chip>
                ))}
                <Chip tone={courseStatusTone[course.status]}>
                  {t(`courses.status.${course.status}`)}
                </Chip>
              </span>
              <span className="flex items-center gap-0.5">
                <MoveButtons
                  action={reorderCourse}
                  fields={{ id: course.id }}
                  labels={{
                    up: t("common.moveUp", { name: course.title }),
                    down: t("common.moveDown", { name: course.title }),
                  }}
                  first={index === 0}
                  last={index === courses.length - 1}
                />
              </span>
            </Row>
          ))}
        </RowList>
      )}
    </PageFrame>
  );
}
