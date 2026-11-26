"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { BilingualField } from "@/components/forms/bilingual-field";
import { FormMessage } from "@/components/forms/form-message";
import { LanguageTabs } from "@/components/forms/language-tabs";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import type { Bilingual } from "@/lib/dal/mutations";
import { routes } from "@/lib/routes";
import { saveModule } from "./actions";
import { TITLE_MAX } from "./constants";

/** Creates a module in a course, or edits the one given. */
export function ModuleForm({
  courseId,
  module: existing,
}: {
  courseId: string;
  module?: { id: string; title: Bilingual; description: Bilingual };
}) {
  const t = useTranslations("Trainer");
  const locale = useLocale();
  const [state, formAction] = useActionState(saveModule, idleState);
  const values = state.values;
  const errors = state.fieldErrors;
  const languages = { pt: t("common.portuguese"), en: t("common.english") };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <LocaleField />
      <input type="hidden" name="course_id" value={courseId} />
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
      <FormMessage state={state} />

      <LanguageTabs
        label={t("common.editingLanguage")}
        languages={languages}
        errorSuffix={t("common.hasErrors")}
        initial={locale === "en" ? "en" : "pt"}
        errors={errors}
      >
        <BilingualField
          label={t("content.moduleTitle")}
          name="title"
          languages={languages}
          help={t("content.oneLanguage")}
          maxLength={TITLE_MAX}
          defaultValues={{
            pt: values?.title_pt ?? existing?.title.pt,
            en: values?.title_en ?? existing?.title.en,
          }}
          errors={{ pt: errors?.title_pt, en: errors?.title_en }}
        />
        <BilingualField
          label={t("content.moduleDescription")}
          name="description"
          languages={languages}
          hint={t("common.optional")}
          help={t("content.moduleDescriptionHelp")}
          multiline
          rows={3}
          maxLength={1000}
          defaultValues={{
            pt: values?.description_pt ?? existing?.description.pt,
            en: values?.description_en ?? existing?.description.en,
          }}
          errors={{ pt: errors?.description_pt, en: errors?.description_en }}
        />
      </LanguageTabs>

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="max-sm:w-full">
          {existing ? t("common.save") : t("common.create")}
        </SubmitButton>
        <Link
          href={routes.trainerCourseContent(courseId)}
          className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
