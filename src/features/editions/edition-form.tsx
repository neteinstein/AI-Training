"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { BilingualField } from "@/components/forms/bilingual-field";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { LanguageTabs } from "@/components/forms/language-tabs";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import type { Bilingual } from "@/lib/dal/mutations";
import { routes } from "@/lib/routes";
import { saveEdition } from "./actions";
import { EDITION_NAME_MAX } from "./constants";

/** Creates an edition of a course, or edits the one given. */
export function EditionForm({
  courseId,
  edition,
}: {
  courseId: string;
  edition?: {
    id: string;
    name: Bilingual;
    startsOn: string | null;
    endsOn: string | null;
    isListed: boolean;
  };
}) {
  const t = useTranslations("Trainer");
  const locale = useLocale();
  const [state, formAction] = useActionState(saveEdition, idleState);
  const values = state.values;
  const errors = state.fieldErrors;
  const languages = { pt: t("common.portuguese"), en: t("common.english") };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <LocaleField />
      <input type="hidden" name="course_id" value={courseId} />
      {edition ? <input type="hidden" name="id" value={edition.id} /> : null}
      <FormMessage state={state} />

      <LanguageTabs
        label={t("common.editingLanguage")}
        languages={languages}
        errorSuffix={t("common.hasErrors")}
        initial={locale === "en" ? "en" : "pt"}
        errors={errors}
      >
        <BilingualField
          label={t("editions.name")}
          name="name"
          languages={languages}
          help={t("editions.nameHelp")}
          maxLength={EDITION_NAME_MAX}
          required
          defaultValues={{
            pt: values?.name_pt ?? edition?.name.pt,
            en: values?.name_en ?? edition?.name.en,
          }}
          errors={{ pt: errors?.name_pt, en: errors?.name_en }}
        />
      </LanguageTabs>

      <div className="flex flex-col gap-2">
        <div className="grid max-w-xl gap-x-4 gap-y-6 sm:grid-cols-2">
          <TextField
            label={t("editions.startsOn")}
            name="starts_on"
            type="date"
            hint={t("common.optional")}
            defaultValue={values?.starts_on ?? edition?.startsOn ?? ""}
            error={errors?.starts_on}
          />
          <TextField
            label={t("editions.endsOn")}
            name="ends_on"
            type="date"
            hint={t("common.optional")}
            defaultValue={values?.ends_on ?? edition?.endsOn ?? ""}
            error={errors?.ends_on}
          />
        </div>
        <p className="text-muted-foreground text-sm">{t("editions.datesHelp")}</p>
      </div>

      <CheckboxField
        name="is_listed"
        defaultChecked={values ? values.is_listed === "on" : (edition?.isListed ?? false)}
      >
        <span className="text-foreground text-base font-semibold">{t("editions.listed")}</span>
        <span className="block">{t("editions.listedHelp")}</span>
      </CheckboxField>

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="max-sm:w-full">
          {edition ? t("common.save") : t("common.create")}
        </SubmitButton>
        <Link
          href={routes.trainerCourseEditions(courseId)}
          className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
