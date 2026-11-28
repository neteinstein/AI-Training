"use client";

import { useTranslations } from "next-intl";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Chip } from "@/components/trainer/chips";
import { useNoticeAction } from "@/components/trainer/use-notice-action";
import type { TrainerOption } from "@/lib/dal/trainer-queries";
import { saveCourseTrainers } from "./actions";

/** Who teaches a course: every trainer with a tick box. Tick, untick, save. */
export function CourseTrainersForm({
  courseId,
  trainers,
  currentUserId,
}: {
  courseId: string;
  /** Every trainer, each saying whether they teach this course now. */
  trainers: TrainerOption[];
  /** The trainer looking at the page, to mark their own line. */
  currentUserId: string;
}) {
  const t = useTranslations("Trainer");
  const [formAction] = useNoticeAction(saveCourseTrainers);
  const teaching = trainers.filter((trainer) => trainer.teaches).map((trainer) => trainer.id);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <LocaleField />
      <input type="hidden" name="course_id" value={courseId} />
      <fieldset className="flex min-w-0 flex-col">
        <legend className="sr-only">{t("courses.trainersLegend")}</legend>
        <ul
          // Shown again from what the database holds after each save.
          key={teaching.join(",")}
          className="border-border bg-card flex max-h-[26rem] list-none flex-col overflow-y-auto rounded-xl border"
        >
          {trainers.map((trainer) => (
            <li key={trainer.id} className="border-muted not-first:border-t">
              <label className="hover:bg-muted flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  name="trainer_ids"
                  value={trainer.id}
                  defaultChecked={trainer.teaches}
                  className="accent-primary size-5 flex-none"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium break-words">
                    {trainer.fullName || trainer.email}
                  </span>
                  {trainer.fullName ? (
                    <span className="text-muted-foreground text-[0.8125rem] wrap-anywhere">
                      {trainer.email}
                    </span>
                  ) : null}
                </span>
                {trainer.id === currentUserId ? <Chip>{t("courses.trainerYou")}</Chip> : null}
                {trainer.isPending ? <Chip tone="attention">{t("users.pending")}</Chip> : null}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <SubmitButton size="sm" className="self-start max-sm:w-full">
        {t("courses.saveTrainers")}
      </SubmitButton>
    </form>
  );
}
