import type { ReactNode } from "react";
import { Chip, courseStatusTone } from "@/components/trainer/chips";
import type { CourseOption } from "@/lib/dal/trainer-queries";
import type { CourseStatus } from "@/lib/dal/types";

/** Every course with a tick box: used to choose the courses of a person or of an invitation. */
export function CourseChecklist({
  legend,
  help,
  courses,
  selected,
  statusLabels,
  emptyText,
  hideLegend = false,
}: {
  legend: string;
  /** For when a heading right above already says what the list is. */
  hideLegend?: boolean;
  help?: ReactNode;
  courses: CourseOption[];
  /** Ids ticked to begin with. */
  selected: string[];
  statusLabels: Record<CourseStatus, string>;
  emptyText: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className={hideLegend ? "sr-only" : "mb-1.5 text-sm leading-snug font-semibold"}>
        {legend}
      </legend>
      {courses.length === 0 ? (
        <p className="text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="border-border bg-card flex max-h-[26rem] list-none flex-col overflow-y-auto rounded-xl border">
          {courses.map((course) => (
            <li key={course.id} className="border-muted not-first:border-t">
              <label className="hover:bg-muted flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  name="course_ids"
                  value={course.id}
                  defaultChecked={selected.includes(course.id)}
                  className="accent-primary size-5 flex-none"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium break-words">{course.title}</span>
                  <span className="text-muted-foreground text-[0.8125rem]">{course.areaName}</span>
                </span>
                {/* A published course is the usual case and needs no label. */}
                {course.status === "published" ? null : (
                  <Chip tone={courseStatusTone[course.status]}>{statusLabels[course.status]}</Chip>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      {help ? <p className="text-muted-foreground text-sm">{help}</p> : null}
    </fieldset>
  );
}
