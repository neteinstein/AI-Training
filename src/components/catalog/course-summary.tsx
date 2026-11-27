import type { CourseCard as Course } from "@/lib/dal/types";
import { cn } from "@/lib/utils";
import { AreaChip } from "./area-chip";
import { CourseFacts } from "./course-card";
import { CourseWhenWhere } from "./course-when-where";

/** A course shown for information (not a link): area, title, date, place, level and duration. */
export function CourseSummary({ course, className }: { course: Course; className?: string }) {
  return (
    <div
      className={cn("border-border bg-card flex flex-col gap-3 rounded-2xl border p-5", className)}
    >
      <AreaChip area={course.area} className="self-start" />
      <span className="font-heading text-[1.375rem] leading-tight">{course.title}</span>
      <CourseWhenWhere course={course} />
      <CourseFacts course={course} />
    </div>
  );
}
