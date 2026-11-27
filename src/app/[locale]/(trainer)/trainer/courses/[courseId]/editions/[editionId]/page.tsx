import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseFrame } from "@/components/trainer/course-frame";
import { EditionForm } from "@/features/editions/edition-form";
import { requireTrainer } from "@/lib/dal/session";
import { fetchCourseEditions } from "@/lib/dal/trainer-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/editions/[editionId]">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.editions");
  return { title: t("edit") };
}

export default async function EditEditionPage({ params }: Props) {
  const { courseId, editionId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.editions");
  // An edition is only edited under its own course's address.
  const editions = await fetchCourseEditions(await createSupabaseServerClient(), courseId);
  const edition = editions.find((candidate) => candidate.id === editionId);
  if (!edition) notFound();
  const name = edition.name[locale] || edition.name[locale === "pt" ? "en" : "pt"];

  return (
    <CourseFrame courseId={courseId} tab="editions" trail={[{ label: name }]} narrow>
      <h2 className="font-heading text-2xl leading-tight">{t("edit")}</h2>
      <EditionForm courseId={courseId} edition={edition} />
    </CourseFrame>
  );
}
