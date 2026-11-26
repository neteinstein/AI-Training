"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { BilingualField } from "@/components/forms/bilingual-field";
import { FormMessage } from "@/components/forms/form-message";
import { LanguageTabs } from "@/components/forms/language-tabs";
import { LocaleField } from "@/components/forms/locale-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import type { TrainerCourse } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { saveCourse } from "./actions";
import { DESCRIPTION_MAX, SUMMARY_MAX } from "./constants";

type Option = { id: string; name: string };

/** Creates a course, or edits the details of the one given. */
export function CourseForm({
  course,
  areas,
  levels,
}: {
  course?: TrainerCourse;
  areas: Option[];
  levels: Option[];
}) {
  const t = useTranslations("Trainer");
  const locale = useLocale();
  const [state, formAction] = useActionState(saveCourse, idleState);
  const values = state.values;
  const errors = state.fieldErrors;
  const languages = { pt: t("common.portuguese"), en: t("common.english") };
  // Hours are written the way the reader's language writes them: 7,5 in Portuguese.
  const hours =
    course?.durationHours == null
      ? ""
      : String(course.durationHours).replace(".", locale === "pt" ? "," : ".");

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <LocaleField />
      {course ? <input type="hidden" name="id" value={course.id} /> : null}
      <FormMessage state={state} />

      <LanguageTabs
        label={t("common.editingLanguage")}
        languages={languages}
        errorSuffix={t("common.hasErrors")}
        initial={locale === "en" ? "en" : "pt"}
        errors={errors}
      >
        <BilingualField
          label={t("courses.titleField")}
          name="title"
          languages={languages}
          required
          maxLength={160}
          defaultValues={{
            pt: values?.title_pt ?? course?.title.pt,
            en: values?.title_en ?? course?.title.en,
          }}
          errors={{ pt: errors?.title_pt, en: errors?.title_en }}
        />
        <BilingualField
          label={t("courses.summary")}
          name="summary"
          languages={languages}
          help={t("courses.summaryHelp")}
          multiline
          rows={3}
          maxLength={SUMMARY_MAX}
          defaultValues={{
            pt: values?.summary_pt ?? course?.summary.pt,
            en: values?.summary_en ?? course?.summary.en,
          }}
          errors={{ pt: errors?.summary_pt, en: errors?.summary_en }}
        />
        <BilingualField
          label={t("courses.description")}
          name="description"
          languages={languages}
          hint={t("common.optional")}
          help={t("courses.descriptionHelp")}
          multiline
          mono
          rows={12}
          maxLength={DESCRIPTION_MAX}
          defaultValues={{
            pt: values?.description_pt ?? course?.description.pt,
            en: values?.description_en ?? course?.description.en,
          }}
          errors={{ pt: errors?.description_pt, en: errors?.description_en }}
        />
      </LanguageTabs>

      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t("courses.area")}
          name="area_id"
          required
          defaultValue={values?.area_id ?? course?.areaId ?? ""}
          error={errors?.area_id}
        >
          <option value="">{t("courses.choose")}</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("courses.level")}
          name="level_id"
          required
          defaultValue={values?.level_id ?? course?.levelId ?? ""}
          error={errors?.level_id}
        >
          <option value="">{t("courses.choose")}</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("courses.duration")}
          name="duration_hours"
          hint={t("common.optional")}
          help={t("courses.durationHelp")}
          inputMode="decimal"
          autoComplete="off"
          maxLength={5}
          defaultValue={values?.duration_hours ?? hours}
          error={errors?.duration_hours}
        />
      </div>

      <TextField
        label={t("courses.slug")}
        name="slug"
        hint={t("common.optional")}
        help={t("courses.slugHelp")}
        maxLength={80}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        defaultValue={values?.slug ?? course?.slug ?? ""}
        error={errors?.slug}
        fieldClassName="max-w-md"
      />

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="max-sm:w-full">
          {course ? t("common.save") : t("common.create")}
        </SubmitButton>
        {course ? null : (
          <Link
            href={routes.trainerCourses}
            className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
          >
            {t("common.cancel")}
          </Link>
        )}
      </div>
    </form>
  );
}
