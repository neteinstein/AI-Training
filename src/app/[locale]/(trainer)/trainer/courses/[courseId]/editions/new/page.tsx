import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseFrame } from "@/components/trainer/course-frame";
import { EditionForm } from "@/features/editions/edition-form";
import { requireTrainer } from "@/lib/dal/session";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/editions/new">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.editions");
  return { title: t("new") };
}

export default async function NewEditionPage({ params }: Props) {
  const { courseId } = await params;
  await requireTrainer(await getLocale());
  const t = await getTranslations("Trainer.editions");

  return (
    <CourseFrame courseId={courseId} tab="editions" trail={[{ label: t("new") }]} narrow>
      <h2 className="font-heading text-2xl leading-tight">{t("new")}</h2>
      <EditionForm courseId={courseId} />
    </CourseFrame>
  );
}
