import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { LevelForm } from "@/features/catalog/level-form";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerLevels } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";

type Props = PageProps<"/[locale]/trainer/levels/[levelId]">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.levels");
  return { title: t("edit") };
}

export default async function EditLevelPage({ params }: Props) {
  const { levelId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.levels");
  const level = (await getTrainerLevels()).find((candidate) => candidate.id === levelId);
  if (!level) notFound();

  return (
    <PageFrame
      crumbs={[{ label: t("title"), href: routes.trainerLevels }, { label: level.name[locale] }]}
      title={t("edit")}
      narrow
    >
      <LevelForm level={level} />
    </PageFrame>
  );
}
