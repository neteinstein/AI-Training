import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AreaIcon } from "@/components/catalog/area-icon";
import { areaTone } from "@/components/catalog/area-style";
import { ActionButton } from "@/components/trainer/action-button";
import { actionLooks } from "@/components/trainer/looks";
import { PageFrame } from "@/components/trainer/page-frame";
import { EmptyState, MoveButtons, Row, RowList, RowTile } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { removeArea, reorderArea } from "@/features/catalog/actions";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerAreas } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.areas");
  return { title: t("title") };
}

export default async function AreasPage() {
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer");
  const areas = await getTrainerAreas();
  const other = locale === "pt" ? "en" : "pt";

  return (
    <PageFrame
      crumbs={[{ label: t("areas.title") }]}
      title={t("areas.title")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("areas.lead")}</p>}
      headerAside={
        <Link href={routes.trainerAreaNew} className={buttonClass({ size: "sm" })}>
          <Plus aria-hidden="true" />
          {t("areas.new")}
        </Link>
      }
    >
      {areas.length === 0 ? (
        <EmptyState>{t("areas.empty")}</EmptyState>
      ) : (
        <RowList label={t("areas.title")}>
          {areas.map((area, index) => {
            const name = area.name[locale];
            return (
              <Row key={area.id}>
                <RowTile className={areaTone[area.color]}>
                  <AreaIcon name={area.icon} className="size-5" />
                </RowTile>
                <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
                  <span className="font-semibold break-words">{name}</span>
                  <span className="text-muted-foreground text-[0.8125rem] break-words">
                    <span lang={other === "pt" ? "pt-PT" : "en"}>{area.name[other]}</span>
                    {" · "}
                    {t("areas.courseCount", { count: area.courseCount })}
                  </span>
                </span>
                <span className="flex items-center gap-0.5">
                  <MoveButtons
                    action={reorderArea}
                    fields={{ id: area.id }}
                    labels={{
                      up: t("common.moveUp", { name }),
                      down: t("common.moveDown", { name }),
                    }}
                    first={index === 0}
                    last={index === areas.length - 1}
                  />
                  <Link
                    href={routes.trainerArea(area.id)}
                    aria-label={t("common.editNamed", { name })}
                    className={actionLooks.icon}
                  >
                    <Pencil aria-hidden="true" className="size-[18px]" />
                  </Link>
                  <ActionButton
                    action={removeArea}
                    fields={{ id: area.id }}
                    look="icon"
                    label={t("common.deleteNamed", { name })}
                    confirm={{
                      title: t("areas.deleteTitle", { name }),
                      text: t("areas.deleteText"),
                      confirmLabel: t("common.confirmDelete"),
                      cancelLabel: t("common.cancel"),
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-[18px]" />
                  </ActionButton>
                </span>
              </Row>
            );
          })}
        </RowList>
      )}
    </PageFrame>
  );
}
