import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { LevelForm } from "@/features/catalog/level-form";
import { requireTrainer } from "@/lib/dal/session";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.levels");
  return { title: t("new") };
}

export default async function NewLevelPage() {
  await requireTrainer(await getLocale());
  const t = await getTranslations("Trainer.levels");

  return (
    <PageFrame
      crumbs={[{ label: t("title"), href: routes.trainerLevels }, { label: t("new") }]}
      title={t("new")}
      narrow
    >
      <LevelForm />
    </PageFrame>
  );
}
