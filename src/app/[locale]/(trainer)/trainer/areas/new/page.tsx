import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { AreaForm } from "@/features/catalog/area-form";
import { requireTrainer } from "@/lib/dal/session";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.areas");
  return { title: t("new") };
}

export default async function NewAreaPage() {
  await requireTrainer(await getLocale());
  const t = await getTranslations("Trainer.areas");

  return (
    <PageFrame
      crumbs={[{ label: t("title"), href: routes.trainerAreas }, { label: t("new") }]}
      title={t("new")}
      narrow
    >
      <AreaForm />
    </PageFrame>
  );
}
