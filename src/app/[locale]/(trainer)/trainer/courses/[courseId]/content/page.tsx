import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { KindGlyph, MaterialIcon } from "@/components/materials/kind";
import { materialMeta } from "@/components/materials/meta";
import { ActionButton } from "@/components/trainer/action-button";
import { actionLooks } from "@/components/trainer/looks";
import { Chip } from "@/components/trainer/chips";
import { CourseFrame } from "@/components/trainer/course-frame";
import { RowMenu, type MenuEntry } from "@/components/trainer/row-menu";
import { EmptyState, MoveButtons } from "@/components/trainer/rows";
import { buttonClass } from "@/components/ui/button";
import {
  moveMaterialTo,
  removeMaterial,
  removeModule,
  reorderMaterial,
  reorderModule,
  showAllMaterials,
} from "@/features/materials/actions";
import { ModuleCard } from "@/features/materials/module-card";
import { VisibilitySwitch } from "@/features/materials/visibility-switch";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerCourse } from "@/lib/dal/trainer";
import { fetchCourseBuilder } from "@/lib/dal/trainer-queries";
import type { MaterialKind } from "@/lib/dal/types";
import type { EmbedProvider } from "@/lib/embeds/parse";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = PageProps<"/[locale]/trainer/courses/[courseId]/content">;

const kinds: MaterialKind[] = ["file", "video", "embed", "link", "page"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const locale = await getLocale();
  await requireTrainer(locale);
  const t = await getTranslations("Trainer.courses.tabs");
  const course = await getTrainerCourse(courseId);
  return { title: course ? `${t("content")}: ${course.title[locale]}` : undefined };
}

export default async function CourseContentPage({ params, searchParams }: Props) {
  const { courseId } = await params;
  const { module: asked } = await searchParams;
  const focused = typeof asked === "string" ? asked : "";
  const locale = await getLocale();
  await requireTrainer(locale);
  const [t, tm, course, modules] = await Promise.all([
    getTranslations("Trainer"),
    getTranslations("Materials"),
    getTrainerCourse(courseId),
    fetchCourseBuilder(await createSupabaseServerClient(), courseId),
  ]);
  const other = locale === "pt" ? "en" : "pt";
  const named = modules.map((module, index) => {
    const name = module.title[locale] || module.title[other];
    return {
      ...module,
      name,
      heading: t("content.numbered", { number: index + 1, title: name }),
    };
  });
  const labels = {
    kind: (kind: MaterialKind) => tm(`kind.${kind}`),
    provider: (provider: EmbedProvider) => tm(`provider.${provider}`),
  };
  const confirmWords = { confirmLabel: t("common.confirmDelete"), cancelLabel: t("common.cancel") };

  const addModule = (
    <Link
      href={routes.trainerModuleNew(courseId)}
      className="border-input text-primary hover:bg-accent flex min-h-13 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed font-semibold no-underline transition-colors"
    >
      <Plus aria-hidden="true" className="size-[18px]" />
      {t("content.addModule")}
    </Link>
  );

  return (
    <CourseFrame courseId={courseId} tab="content">
      {named.length === 0 ? (
        <EmptyState
          action={
            <Link href={routes.trainerModuleNew(courseId)} className={buttonClass({ size: "sm" })}>
              <Plus aria-hidden="true" />
              {t("content.addModule")}
            </Link>
          }
        >
          {t("content.empty")}
        </EmptyState>
      ) : null}

      {named.map((module, index) => {
        const total = module.materials.length;
        const visible = module.materials.filter((material) => material.isPublished).length;
        const elsewhere = named.filter((candidate) => candidate.id !== module.id);

        return (
          <ModuleCard
            key={module.id}
            courseId={courseId}
            moduleId={module.id}
            label={t("content.moduleLabel", { number: index + 1, title: module.name })}
            heading={module.heading}
            summary={
              total === 0 ? t("content.noMaterials") : t("content.summary", { total, visible })
            }
            defaultOpen={index === 0 || module.id === focused}
            focused={module.id === focused}
            toggleLabels={{
              open: t("content.open"),
              close: t("content.close"),
              openNamed: t("content.openNamed", { name: module.name }),
              closeNamed: t("content.closeNamed", { name: module.name }),
            }}
            openActions={
              <>
                {visible < total ? (
                  <ActionButton
                    action={showAllMaterials}
                    fields={{ module_id: module.id }}
                    look="text"
                    label={t("content.showAllNamed", { name: module.name })}
                  >
                    {t("content.showAll")}
                  </ActionButton>
                ) : null}
                <Link
                  href={routes.trainerModule(courseId, module.id)}
                  aria-label={t("common.editNamed", { name: module.name })}
                  className={actionLooks.text}
                >
                  {t("common.edit")}
                </Link>
              </>
            }
            actions={
              <>
                <MoveButtons
                  action={reorderModule}
                  fields={{ id: module.id }}
                  labels={{
                    up: t("common.moveUp", { name: module.name }),
                    down: t("common.moveDown", { name: module.name }),
                  }}
                  first={index === 0}
                  last={index === named.length - 1}
                />
                <RowMenu
                  label={t("common.moreActions", { name: module.name })}
                  entries={[
                    {
                      type: "link",
                      label: t("content.editModule"),
                      href: routes.trainerModule(courseId, module.id),
                      icon: <Pencil aria-hidden="true" className="size-[18px]" />,
                    },
                    { type: "separator" },
                    {
                      type: "action",
                      label: t("content.deleteModule"),
                      action: removeModule,
                      fields: { id: module.id },
                      danger: true,
                      icon: <Trash2 aria-hidden="true" className="size-[18px]" />,
                      confirm: {
                        title: t("content.deleteModuleTitle", { name: module.name }),
                        text: t("content.deleteModuleText"),
                        ...confirmWords,
                      },
                    },
                  ]}
                />
              </>
            }
          >
            {total > 0 ? (
              <ul className="flex list-none flex-col">
                {module.materials.map((material, position) => {
                  const title = material.title[locale] || material.title[other];
                  const editHref = routes.trainerMaterial(courseId, material.id);
                  const entries: MenuEntry[] = [
                    {
                      type: "link",
                      label: t("common.edit"),
                      href: editHref,
                      icon: <Pencil aria-hidden="true" className="size-[18px]" />,
                    },
                  ];
                  if (course) {
                    entries.push({
                      type: "link",
                      label: t("content.viewAsLearner"),
                      href: routes.learnMaterial(course.slug, material.id),
                      icon: <Eye aria-hidden="true" className="size-[18px]" />,
                    });
                  }
                  if (elsewhere.length > 0) {
                    entries.push(
                      { type: "separator" },
                      { type: "heading", label: t("content.moveTo") },
                      ...elsewhere.map((target): MenuEntry => ({
                        type: "action",
                        label: target.heading,
                        action: moveMaterialTo,
                        fields: {
                          id: material.id,
                          module_id: target.id,
                          module_name: target.name,
                        },
                      })),
                    );
                  }
                  entries.push(
                    { type: "separator" },
                    {
                      type: "action",
                      label: t("content.deleteMaterial"),
                      action: removeMaterial,
                      fields: { id: material.id },
                      danger: true,
                      icon: <Trash2 aria-hidden="true" className="size-[18px]" />,
                      confirm: {
                        title: t("content.deleteMaterialTitle", { name: title }),
                        text: t("content.deleteMaterialText"),
                        ...confirmWords,
                      },
                    },
                  );

                  return (
                    <li
                      key={material.id}
                      className="border-muted flex min-h-15 flex-wrap items-center gap-x-4 gap-y-1 py-1.5 pr-2 pl-5 not-first:border-t"
                    >
                      <MaterialIcon material={material} size="sm" className="rounded-[10px]" />
                      <span className="flex min-w-0 flex-[1_1_15rem] flex-col">
                        <Link
                          href={editHref}
                          className="text-foreground self-start font-semibold break-words no-underline hover:underline"
                        >
                          {title}
                        </Link>
                        <span className="text-muted-foreground text-[0.8125rem]">
                          {/* The language has its own chip in this list. */}
                          {materialMeta({ ...material, contentLanguage: null }, labels, locale)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {material.contentLanguage ? (
                          <Chip>{material.contentLanguage.toUpperCase()}</Chip>
                        ) : null}
                        {material.gaps.map((gap) => (
                          <Chip key={gap} tone="attention">
                            {t("common.missing", { language: gap.toUpperCase() })}
                          </Chip>
                        ))}
                      </span>
                      {/* Kept together, so on a phone they wrap as one line of controls. */}
                      <span className="flex items-center gap-x-2">
                        <VisibilitySwitch
                          materialId={material.id}
                          visible={material.isPublished}
                          label={t("content.visibleFor", { name: title })}
                          onLabel={t("content.visible")}
                          offLabel={t("content.hidden")}
                        />
                        <span className="flex items-center gap-0.5">
                          <MoveButtons
                            action={reorderMaterial}
                            fields={{ id: material.id }}
                            labels={{
                              up: t("common.moveUp", { name: title }),
                              down: t("common.moveDown", { name: title }),
                            }}
                            first={position === 0}
                            last={position === total - 1}
                          />
                          <RowMenu
                            label={t("common.moreActions", { name: title })}
                            entries={entries}
                          />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div
              role="group"
              aria-label={t("content.addMaterialTo", { name: module.name })}
              className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 [ul+&]:border-t"
            >
              <span className="text-muted-foreground text-sm font-semibold">
                {t("content.addMaterial")}
              </span>
              {kinds.map((kind) => (
                <Link
                  key={kind}
                  href={routes.trainerMaterialNew(courseId, module.id, kind)}
                  className={`${actionLooks.neutral} no-underline`}
                >
                  <KindGlyph kind={kind} />
                  {t(`content.add.${kind}`)}
                </Link>
              ))}
            </div>
          </ModuleCard>
        );
      })}

      {named.length > 0 ? addModule : null}
    </CourseFrame>
  );
}
