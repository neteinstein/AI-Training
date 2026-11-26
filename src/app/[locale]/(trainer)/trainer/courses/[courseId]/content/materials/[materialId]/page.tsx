import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fileTypeLabel } from "@/components/materials/kind";
import { CourseFrame } from "@/components/trainer/course-frame";
import { MaterialForm } from "@/features/materials/material-form";
import { requireTrainer } from "@/lib/dal/session";
import { fetchEditableMaterial } from "@/lib/dal/trainer-queries";
import { formatFileSize } from "@/lib/files/rules";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content/materials/[materialId]">;

async function load(params: Props["params"]) {
  const { courseId, materialId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const material = await fetchEditableMaterial(await createSupabaseServerClient(), materialId);
  // A material is only edited under its own course's address.
  return { courseId, locale, material: material?.courseId === courseId ? material : null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { material, locale } = await load(params);
  return {
    title: material ? material.title[locale] || material.title.pt || material.title.en : undefined,
  };
}

export default async function EditMaterialPage({ params }: Props) {
  const { courseId, locale, material } = await load(params);
  if (!material) notFound();
  const t = await getTranslations("Trainer.content");
  const title = material.title[locale] || material.title[locale === "pt" ? "en" : "pt"];

  return (
    <CourseFrame courseId={courseId} tab="content" trail={[{ label: title }]} narrow>
      <h2 className="font-heading text-2xl leading-tight">{t(`edit.${material.kind}`)}</h2>
      <MaterialForm
        courseId={courseId}
        kind={material.kind}
        material={material}
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
