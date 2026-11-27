import { CalendarDays, LayoutList, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/trainer/chips";
import { CourseFrame } from "@/components/trainer/course-frame";
import { RowMenu, type MenuEntry } from "@/components/trainer/row-menu";
import { Row, RowList, RowTile } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import { makeDefault, removeEdition } from "@/features/editions/actions";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerCourse } from "@/lib/dal/trainer";
import { fetchCourseEditions } from "@/lib/dal/trainer-queries";
import { formatDays } from "@/lib/dates";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/editions">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.editions");
  const course = await getTrainerCourse(courseId);
  return { title: course ? `${t("title")}: ${course.title[locale]}` : undefined };
}

export default async function CourseEditionsPage({ params }: Props) {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const [t, format, editions] = await Promise.all([
    getTranslations("Trainer"),
    getFormatter(),
    fetchCourseEditions(await createSupabaseServerClient(), courseId),
  ]);
  const other = locale === "pt" ? "en" : "pt";
  const icon = "size-[18px]";

  return (
    <CourseFrame courseId={courseId} tab="editions">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <p className="text-muted-foreground max-w-[46em]">
          {t("editions.lead")} {t("editions.leadDefault")}
        </p>
        <Link href={routes.trainerEditionNew(courseId)} className={buttonClass({ size: "sm" })}>
          <Plus aria-hidden="true" />
          {t("editions.new")}
        </Link>
      </div>

      <RowList label={t("editions.listLabel")}>
        {editions.map((edition) => {
          const name = edition.name[locale] || edition.name[other];
          const facts = [
            formatDays(format, edition.startsOn, edition.endsOn) ?? t("editions.noDates"),
            t("editions.learners", { count: edition.learnerCount }),
            edition.ownMaterials > 0 ? t("editions.own", { count: edition.ownMaterials }) : null,
            edition.hiddenMaterials > 0
              ? t("editions.hidden", { count: edition.hiddenMaterials })
              : null,
          ].filter(Boolean);

          const entries: MenuEntry[] = [
            {
              type: "link",
              label: t("common.edit"),
              href: routes.trainerEdition(courseId, edition.id),
              icon: <Pencil aria-hidden="true" className={icon} />,
            },
          ];
          // With a single edition there is nothing to tell apart: the content tab shows it all.
          if (editions.length > 1) {
            entries.push({
              type: "link",
              label: t("editions.viewContent"),
              href: routes.trainerCourseContent(courseId, edition.id),
              icon: <LayoutList aria-hidden="true" className={icon} />,
            });
          }
          if (!edition.isDefault) {
            entries.push({
              type: "action",
              label: t("editions.makeDefault"),
              action: makeDefault,
              fields: { id: edition.id },
              icon: <Star aria-hidden="true" className={icon} />,
            });
          }
          entries.push(
            { type: "separator" },
            {
              type: "action",
              label: t("editions.delete"),
              action: removeEdition,
              fields: { id: edition.id },
              danger: true,
              icon: <Trash2 aria-hidden="true" className={icon} />,
              confirm: {
                title: t("editions.deleteTitle", { name }),
                text: t("editions.deleteText"),
                confirmLabel: t("common.confirmDelete"),
                cancelLabel: t("common.cancel"),
              },
            },
          );

          return (
            <Row key={edition.id}>
              <RowTile className="bg-accent text-accent-foreground">
                <CalendarDays className={icon} />
              </RowTile>
              <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
                <Link
                  href={routes.trainerEdition(courseId, edition.id)}
                  className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                >
                  {name}
                </Link>
                <span className="text-muted-foreground text-[0.8125rem]">{facts.join(" · ")}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {edition.isDefault ? <Chip tone="good">{t("editions.default")}</Chip> : null}
                {edition.isListed ? <Chip tone="attention">{t("editions.public")}</Chip> : null}
              </span>
              <RowMenu label={t("common.moreActions", { name })} entries={entries} />
            </Row>
          );
        })}
      </RowList>
    </CourseFrame>
  );
}
