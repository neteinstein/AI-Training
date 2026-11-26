import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseFrame } from "@/components/trainer/course-frame";
import { MaterialForm } from "@/features/materials/material-form";
import { requireTrainer } from "@/lib/dal/session";
import { fetchCourseBuilder } from "@/lib/dal/trainer-queries";
import type { MaterialKind } from "@/lib/dal/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content/materials/new">;

const kinds: readonly MaterialKind[] = ["file", "video", "embed", "link", "page"];
const toKind = (value: unknown): MaterialKind | null =>
  kinds.find((kind) => kind === value) ?? null;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const kind = toKind((await searchParams).kind);
  const t = await getTranslations("Trainer.content");
  return { title: kind ? t(`new.${kind}`) : undefined };
}

export default async function NewMaterialPage({ params, searchParams }: Props) {
  const { courseId } = await params;
  const asked = await searchParams;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.content");

  const kind = toKind(asked.kind);
  const modules = await fetchCourseBuilder(await createSupabaseServerClient(), courseId);
  const index = modules.findIndex((candidate) => candidate.id === asked.module);
  if (!kind || index < 0) notFound();
  const target = modules[index];
  const name = target.title[locale] || target.title[locale === "pt" ? "en" : "pt"];

  return (
    <CourseFrame courseId={courseId} tab="content" trail={[{ label: t(`new.${kind}`) }]} narrow>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl leading-tight">{t(`new.${kind}`)}</h2>
        <p className="text-muted-foreground">
          {t("inModule", { name: t("numbered", { number: index + 1, title: name }) })}
        </p>
      </div>
      <MaterialForm courseId={courseId} kind={kind} moduleId={target.id} />
    </CourseFrame>
  );
}
