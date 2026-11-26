import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { ActionButton } from "@/components/trainer/action-button";
import { actionLooks } from "@/components/trainer/looks";
import { PageFrame } from "@/components/trainer/page-frame";
import { EmptyState, MoveButtons, Row, RowList, RowTile } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { removeLevel, reorderLevel } from "@/features/catalog/actions";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerLevels } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trainer.levels");
  return { title: t("title") };
}

export default async function LevelsPage() {
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer");
  const levels = await getTrainerLevels();
  const other = locale === "pt" ? "en" : "pt";

  return (
    <PageFrame
      crumbs={[{ label: t("levels.title") }]}
      title={t("levels.title")}
      meta={<p className="text-muted-foreground max-w-[44em]">{t("levels.lead")}</p>}
      headerAside={
        <Link href={routes.trainerLevelNew} className={buttonClass({ size: "sm" })}>
          <Plus aria-hidden="true" />
          {t("levels.new")}
        </Link>
      }
    >
      {levels.length === 0 ? (
        <EmptyState>{t("levels.empty")}</EmptyState>
      ) : (
        <RowList label={t("levels.title")}>
          {levels.map((level, index) => {
            const name = level.name[locale];
            return (
              <Row key={level.id}>
                <RowTile className="bg-muted">
                  <LevelGlyph step={level.step} size={18} />
                </RowTile>
                <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
                  <span className="font-semibold break-words">{name}</span>
                  <span className="text-muted-foreground text-[0.8125rem] break-words">
                    <span lang={other === "pt" ? "pt-PT" : "en"}>{level.name[other]}</span>
                    {" · "}
                    {t("levels.courseCount", { count: level.courseCount })}
                  </span>
                </span>
                <span className="flex items-center gap-0.5">
                  <MoveButtons
                    action={reorderLevel}
                    fields={{ id: level.id }}
                    labels={{
                      up: t("common.moveUp", { name }),
                      down: t("common.moveDown", { name }),
                    }}
                    first={index === 0}
                    last={index === levels.length - 1}
                  />
                  <Link
                    href={routes.trainerLevel(level.id)}
                    aria-label={t("common.editNamed", { name })}
                    className={actionLooks.icon}
                  >
                    <Pencil aria-hidden="true" className="size-[18px]" />
                  </Link>
                  <ActionButton
                    action={removeLevel}
                    fields={{ id: level.id }}
                    look="icon"
                    label={t("common.deleteNamed", { name })}
                    confirm={{
                      title: t("levels.deleteTitle", { name }),
                      text: t("levels.deleteText"),
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
