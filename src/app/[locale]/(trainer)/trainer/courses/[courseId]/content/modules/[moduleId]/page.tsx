import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseFrame } from "@/components/trainer/course-frame";
import { ModuleForm } from "@/features/materials/module-form";
import { requireTrainer } from "@/lib/dal/session";
import { fetchCourseBuilder } from "@/lib/dal/trainer-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content/modules/[moduleId]">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.content");
  return { title: t("editModule") };
}

export default async function EditModulePage({ params }: Props) {
  const { courseId, moduleId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.content");
  const modules = await fetchCourseBuilder(await createSupabaseServerClient(), courseId);
  const existing = modules.find((candidate) => candidate.id === moduleId);
  if (!existing) notFound();
  const name = existing.title[locale] || existing.title[locale === "pt" ? "en" : "pt"];

  return (
    <CourseFrame courseId={courseId} tab="content" trail={[{ label: name }]} narrow>
      <h2 className="font-heading text-2xl leading-tight font-semibold">{t("editModule")}</h2>
      <ModuleForm courseId={courseId} module={existing} />
    </CourseFrame>
  );
}
