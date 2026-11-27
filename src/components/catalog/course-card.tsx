import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CourseCard as Course } from "@/lib/dal/types";
import { cn } from "@/lib/utils";
import { AreaChip } from "./area-chip";
import { CourseWhenWhere } from "./course-when-where";
import { LevelGlyph } from "./level-glyph";

/** Level and duration, as shown at the bottom of a card and in a course header. */
export function CourseFacts({ course, className }: { course: Course; className?: string }) {
  const t = useTranslations("Catalog");
  return (
    <span className={cn("text-muted-foreground flex items-center gap-2.5 text-sm", className)}>
      <LevelGlyph step={course.level.step} />
      <span className="text-foreground font-semibold">{course.level.name}</span>
      {course.durationHours !== null ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{t("hours", { hours: course.durationHours })}</span>
        </>
      ) : null}
    </span>
  );
}

/** A course in a grid. The whole card is one link. */
export function CourseCard({
  course,
  href,
  headingLevel = "h3",
  className,
}: {
  course: Course;
  href: string;
  headingLevel?: "h2" | "h3";
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <Link
      href={href}
      className={cn(
        "group border-border bg-card text-foreground hover:border-input flex flex-col gap-4 rounded-2xl border p-6 no-underline transition-[border-color,box-shadow] hover:shadow-(--shadow-raised)",
        className,
      )}
    >
      <AreaChip area={course.area} className="self-start" />
      <span className="flex flex-col gap-2">
        <Heading className="font-heading group-hover:text-primary text-[1.375rem] leading-tight transition-colors">
          {course.title}
        </Heading>
        {course.summary ? (
          <span className="text-muted-foreground text-[0.9375rem] leading-[1.55]">
            {course.summary}
          </span>
        ) : null}
      </span>
      <span className="border-border mt-auto flex flex-col gap-2.5 border-t pt-4">
        <CourseWhenWhere course={course} />
        <CourseFacts course={course} />
      </span>
    </Link>
  );
}
