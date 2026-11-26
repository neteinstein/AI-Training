import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/trainer/action-button";
import { CourseFrame } from "@/components/trainer/course-frame";
import { removeCourse } from "@/features/courses/actions";
import { CourseForm } from "@/features/courses/course-form";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerAreas, getTrainerCourse, getTrainerLevels } from "@/lib/dal/trainer";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const course = await getTrainerCourse(courseId);
  return { title: course?.title[locale] };
}

export default async function CourseDetailsPage({ params }: Props) {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer");
  const [course, areas, levels] = await Promise.all([
    getTrainerCourse(courseId),
    getTrainerAreas(),
    getTrainerLevels(),
  ]);
  if (!course) notFound();
  const name = course.title[locale];

  return (
    <CourseFrame courseId={course.id} tab="details" narrow>
      <CourseForm
        course={course}
        areas={areas.map((area) => ({ id: area.id, name: area.name[locale] }))}
        levels={levels.map((level) => ({ id: level.id, name: level.name[locale] }))}
      />

      <section
        aria-labelledby="delete-course"
        className="border-border mt-6 flex flex-col items-start gap-2 border-t pt-6"
      >
        <h2 id="delete-course" className="font-heading text-xl leading-tight">
          {t("courses.deleteHeading")}
        </h2>
        <p className="text-muted-foreground max-w-[44em]">{t("courses.deleteHelp")}</p>
        <ActionButton
          action={removeCourse}
          fields={{ id: course.id }}
          look="danger"
          className="border-destructive border-[1.5px] px-4"
          confirm={{
            title: t("courses.deleteTitle", { name }),
            text: t("courses.deleteText"),
            confirmLabel: t("common.confirmDelete"),
            cancelLabel: t("common.cancel"),
          }}
        >
          <Trash2 aria-hidden="true" className="size-[18px]" />
          {t("courses.deleteCourse")}
        </ActionButton>
      </section>
    </CourseFrame>
  );
}
