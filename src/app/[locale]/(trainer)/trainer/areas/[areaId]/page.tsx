import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/trainer/page-frame";
import { AreaForm } from "@/features/catalog/area-form";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerAreas } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";

type Props = PageProps<"/[locale]/trainer/areas/[areaId]">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.areas");
  return { title: t("edit") };
}

export default async function EditAreaPage({ params }: Props) {
  const { areaId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.areas");
  const area = (await getTrainerAreas()).find((candidate) => candidate.id === areaId);
  if (!area) notFound();

  return (
    <PageFrame
      crumbs={[{ label: t("title"), href: routes.trainerAreas }, { label: area.name[locale] }]}
      title={t("edit")}
      narrow
    >
      <AreaForm area={area} />
    </PageFrame>
  );
}
