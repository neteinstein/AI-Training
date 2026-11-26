import { ExternalLink, Eye } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AreaChip } from "@/components/catalog/area-chip";
import { LevelGlyph } from "@/components/catalog/level-glyph";
import { StatusControl } from "@/features/courses/status-control";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { getTrainerAreas, getTrainerCourse, getTrainerLevels } from "@/lib/dal/trainer";
import { routes } from "@/lib/routes";
import { PageFrame, TabLinks, type Crumb } from "./page-frame";

const barLink =
  "text-primary hover:text-primary-hover inline-flex min-h-11 items-center gap-2 font-semibold no-underline";

/**
 * The top of every page of one course: where you are, its name, area, level and status, and
 * the tabs. Pages under a tab (a material's form, say) add their own trail with `trail`.
 */
export async function CourseFrame({
  courseId,
  tab,
  trail = [],
  narrow,
  children,
}: {
  courseId: string;
  tab: "details" | "content" | "learners";
  /** Steps after the course in the breadcrumb, e.g. the module being edited. */
  trail?: Crumb[];
  narrow?: boolean;
  children: ReactNode;
}) {
  const locale = await getLocale();
  await requireTrainer(locale);
  const [course, areas, levels, t] = await Promise.all([
    getTrainerCourse(courseId),
    getTrainerAreas(),
    getTrainerLevels(),
    getTranslations("Trainer"),
  ]);
  if (!course) notFound();

  const area = areas.find((candidate) => candidate.id === course.areaId);
  const level = levels.find((candidate) => candidate.id === course.levelId);
  const title = course.title[locale] || course.title.pt || course.title.en;
  const tabHref = {
    details: routes.trainerCourse(course.id),
    content: routes.trainerCourseContent(course.id),
    learners: routes.trainerCourseLearners(course.id),
  };

  return (
    <PageFrame
      crumbs={[
        { label: t("courses.title"), href: routes.trainerCourses },
        trail.length > 0 ? { label: title, href: tabHref[tab] } : { label: title },
        ...trail,
      ]}
      barActions={
        <>
          {course.status === "published" ? (
            <Link href={routes.course(course.slug)} className={barLink}>
              <ExternalLink aria-hidden="true" className="size-[18px]" />
              {t("courses.viewPublic")}
            </Link>
          ) : null}
          <Link href={routes.learnCourse(course.slug)} className={barLink}>
            <Eye aria-hidden="true" className="size-[18px]" />
            {t("courses.viewAsLearner")}
          </Link>
        </>
      }
      title={title}
      meta={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {area ? (
            <AreaChip area={{ name: area.name[locale], color: area.color, icon: area.icon }} />
          ) : null}
          {level ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <LevelGlyph step={level.step} size={18} />
              {level.name[locale]}
            </span>
          ) : null}
        </div>
      }
      headerAside={<StatusControl courseId={course.id} status={course.status} />}
      tabs={
        <TabLinks
          label={t("courses.tabs.label")}
          tabs={[
            { href: tabHref.details, label: t("courses.tabs.details"), current: tab === "details" },
            { href: tabHref.content, label: t("courses.tabs.content"), current: tab === "content" },
            {
              href: tabHref.learners,
              label: t("courses.tabs.learners", { count: course.learnerCount }),
              current: tab === "learners",
            },
          ]}
        />
      }
      narrow={narrow}
    >
      {children}
    </PageFrame>
  );
}
