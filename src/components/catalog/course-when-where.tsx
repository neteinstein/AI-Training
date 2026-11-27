import { CalendarDays, MapPin } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { CourseCard as Course } from "@/lib/dal/types";
import { dayToDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** When and where the course takes place. Nothing for a course that has neither yet. */
export function CourseWhenWhere({
  course,
  className,
}: {
  course: Pick<Course, "startsOn" | "location">;
  className?: string;
}) {
  const t = useTranslations("Catalog");
  const format = useFormatter();
  if (!course.startsOn && !course.location) return null;
  return (
    <span
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm",
        className,
      )}
    >
      {course.startsOn ? (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="sr-only">{t("date")}: </span>
          <time dateTime={course.startsOn}>
            {/* A calendar day, not an instant: read and shown in UTC so it never shifts. */}
            {format.dateTime(dayToDate(course.startsOn), { dateStyle: "medium", timeZone: "UTC" })}
          </time>
        </span>
      ) : null}
      {course.location ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="sr-only">{t("location")}: </span>
          <span className="min-w-0 break-words">{course.location}</span>
        </span>
      ) : null}
    </span>
  );
}
