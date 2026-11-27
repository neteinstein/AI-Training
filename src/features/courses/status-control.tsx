"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { keepSelected } from "@/components/forms/keep-selected";
import { LocaleField } from "@/components/forms/locale-field";
import { actionLooks } from "@/components/trainer/looks";
import { useNoticeAction } from "@/components/trainer/use-notice-action";
import type { CourseStatus } from "@/lib/dal/types";
import { cn } from "@/lib/utils";
import { changeCourseStatus } from "./actions";

const statuses: CourseStatus[] = ["draft", "published", "unlisted"];

/**
 * The course's status, in the page header. Choosing an option changes nothing until the
 * button is pressed: publishing is not something to do by brushing an arrow key.
 */
export function StatusControl({ courseId, status }: { courseId: string; status: CourseStatus }) {
  const t = useTranslations("Trainer.courses");
  const id = useId();
  const [formAction, pending] = useNoticeAction(changeCourseStatus);
  const [chosen, setChosen] = useState<CourseStatus>(status);
  const unchanged = chosen === status;

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-1.5">
      <LocaleField />
      <input type="hidden" name="id" value={courseId} />
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <label htmlFor={id} className="text-muted-foreground text-sm font-semibold">
          {t("statusLabel")}
        </label>
        <select
          id={id}
          name="status"
          value={chosen}
          ref={keepSelected(chosen)}
          onChange={(event) => setChosen(event.target.value as CourseStatus)}
          aria-describedby={`${id}-help`}
          className="border-input bg-card text-foreground h-11 min-w-42 rounded-lg border px-3 font-semibold"
        >
          {statuses.map((option) => (
            <option key={option} value={option}>
              {t(`status.${option}`)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          aria-disabled={unchanged || pending || undefined}
          onClick={(event) => {
            if (unchanged || pending) event.preventDefault();
          }}
          className={cn(
            actionLooks.primary,
            "aria-disabled:bg-border aria-disabled:text-muted-foreground aria-disabled:cursor-default",
          )}
        >
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          {t("changeStatus")}
        </button>
      </div>
      <p id={`${id}-help`} className="text-muted-foreground text-sm">
        {t(`statusHelp.${chosen}`)}
      </p>
    </form>
  );
}
