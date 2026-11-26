import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseFrame } from "@/components/trainer/course-frame";
import { ModuleForm } from "@/features/materials/module-form";
import { requireTrainer } from "@/lib/dal/session";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content/modules/new">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.content");
  return { title: t("newModule") };
}

export default async function NewModulePage({ params }: Props) {
  const { courseId } = await params;
  await requireTrainer(await getLocale());
  const t = await getTranslations("Trainer.content");

  return (
    <CourseFrame courseId={courseId} tab="content" trail={[{ label: t("newModule") }]} narrow>
      <h2 className="font-heading text-2xl leading-tight font-semibold">{t("newModule")}</h2>
      <ModuleForm courseId={courseId} />
    </CourseFrame>
  );
}
