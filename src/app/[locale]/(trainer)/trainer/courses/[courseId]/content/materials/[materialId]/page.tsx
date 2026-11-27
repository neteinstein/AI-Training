import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { fileTypeLabel } from "@/components/materials/kind";
import { CourseFrame } from "@/components/trainer/course-frame";
import { editionLabel } from "@/features/editions/label";
import { MaterialForm } from "@/features/materials/material-form";
import { requireTrainer } from "@/lib/dal/session";
import { fetchCourseEditions, fetchEditableMaterial } from "@/lib/dal/trainer-queries";
import { formatFileSize } from "@/lib/files/rules";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content/materials/[materialId]">;

async function load(params: Props["params"]) {
  const { courseId, materialId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const supabase = await createSupabaseServerClient();
  const material = await fetchEditableMaterial(supabase, materialId);
  // A material is only edited under its own course's address.
  return {
    courseId,
    locale,
    supabase,
    material: material?.courseId === courseId ? material : null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { material, locale } = await load(params);
  return {
    title: material ? material.title[locale] || material.title.pt || material.title.en : undefined,
  };
}

export default async function EditMaterialPage({ params, searchParams }: Props) {
  const { courseId, locale, supabase, material } = await load(params);
  if (!material) notFound();
  const [t, format, editions, asked] = await Promise.all([
    getTranslations("Trainer.content"),
    getFormatter(),
    fetchCourseEditions(supabase, courseId),
    searchParams,
  ]);
  const other = locale === "pt" ? "en" : "pt";
  const title = material.title[locale] || material.title[other];
  // Opened from one edition's view of the content: saving or cancelling goes back to it.
  const view = editions.find((candidate) => candidate.id === asked.edition) ?? null;

  return (
    <CourseFrame courseId={courseId} tab="content" trail={[{ label: title }]} narrow>
      <h2 className="font-heading text-2xl leading-tight">{t(`edit.${material.kind}`)}</h2>
      <MaterialForm
        courseId={courseId}
        kind={material.kind}
        material={material}
        editions={editions.map((entry) => ({
          id: entry.id,
          label: editionLabel({ ...entry, name: entry.name[locale] || entry.name[other] }, format),
        }))}
        viewEdition={view?.id}
        currentFile={
          material.file
            ? {
                name: material.file.name,
                details: [
                  fileTypeLabel(material.file.name),
                  formatFileSize(material.file.sizeBytes, locale),
                ]
                  .filter(Boolean)
                  .join(" · "),
                downloadHref: routes.materialDownload(material.id),
              }
            : undefined
        }
      />
    </CourseFrame>
  );
}
