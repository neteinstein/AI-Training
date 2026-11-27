import { useId, type ReactNode } from "react";
import { controlClass } from "@/components/forms/field";
import { Chip, courseStatusTone } from "@/components/trainer/chips";
import { editionField } from "@/features/enrollments/fields";
import type { CourseOption, EditionOption } from "@/lib/dal/trainer-queries";
import type { CourseStatus } from "@/lib/dal/types";
import { cn } from "@/lib/utils";

/**
 * Every course with a tick box: used to choose the courses of a person or of an invitation.
 * A ticked course that has several editions also asks which one.
 */
export function CourseChecklist({
  legend,
  help,
  courses,
  selected,
  selectedEditions = {},
  statusLabels,
  editionLabels,
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
  /** The edition each course starts on, by course id; otherwise its default edition. */
  selectedEditions?: Record<string, string>;
  statusLabels: Record<CourseStatus, string>;
  editionLabels: {
    /** The words beside each choice: "Edition". */
    label: string;
    /** The full name of one choice, for screen readers: "Edition of the course …". */
    of: (courseTitle: string) => string;
    /** One edition written out as a line to choose. */
    option: (edition: EditionOption) => string;
  };
  emptyText: string;
}) {
  const id = useId();

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
            <li key={course.id} className="group border-muted not-first:border-t">
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
              {course.editions.length > 1 ? (
                // Shown while the course is ticked; the choice of an unticked course is ignored.
                <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 pr-4 pb-3 pl-12 group-has-[input:checked]:flex">
                  <label
                    htmlFor={`${id}-${course.id}`}
                    className="text-muted-foreground text-[0.8125rem] font-semibold"
                  >
                    {editionLabels.label}
                  </label>
                  <select
                    id={`${id}-${course.id}`}
                    name={editionField(course.id)}
                    aria-label={editionLabels.of(course.title)}
                    defaultValue={
                      selectedEditions[course.id] ??
                      (course.editions.find((edition) => edition.isDefault) ?? course.editions[0])
                        .id
                    }
                    className={cn(controlClass, "h-11 max-w-sm min-w-0 flex-1 px-3")}
                  >
                    {course.editions.map((edition) => (
                      <option key={edition.id} value={edition.id}>
                        {editionLabels.option(edition)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {help ? <p className="text-muted-foreground text-sm">{help}</p> : null}
    </fieldset>
  );
}
