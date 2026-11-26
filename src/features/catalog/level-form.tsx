"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { BilingualField } from "@/components/forms/bilingual-field";
import { FormMessage } from "@/components/forms/form-message";
import { LanguageTabs } from "@/components/forms/language-tabs";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import type { TrainerLevel } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { saveLevel } from "./actions";

/** Creates a level, or edits the one given. */
export function LevelForm({ level }: { level?: TrainerLevel }) {
  const t = useTranslations("Trainer");
  const locale = useLocale();
  const [state, formAction] = useActionState(saveLevel, idleState);
  const values = state.values;
  const errors = state.fieldErrors;
  const languages = { pt: t("common.portuguese"), en: t("common.english") };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <LocaleField />
      {level ? <input type="hidden" name="id" value={level.id} /> : null}
      <FormMessage state={state} />

      <LanguageTabs
        label={t("common.editingLanguage")}
        languages={languages}
        errorSuffix={t("common.hasErrors")}
        initial={locale === "en" ? "en" : "pt"}
        errors={errors}
      >
        <BilingualField
          label={t("levels.name")}
          name="name"
          languages={languages}
          required
          maxLength={120}
          defaultValues={{
            pt: values?.name_pt ?? level?.name.pt,
            en: values?.name_en ?? level?.name.en,
          }}
          errors={{ pt: errors?.name_pt, en: errors?.name_en }}
        />
        <BilingualField
          label={t("levels.description")}
          name="description"
          languages={languages}
          hint={t("common.optional")}
          help={t("levels.descriptionHelp")}
          multiline
          rows={3}
          maxLength={600}
          defaultValues={{
            pt: values?.description_pt ?? level?.description.pt,
            en: values?.description_en ?? level?.description.en,
          }}
          errors={{ pt: errors?.description_pt, en: errors?.description_en }}
        />
      </LanguageTabs>

      <TextField
        label={t("levels.slug")}
        name="slug"
        hint={t("common.optional")}
        help={t("levels.slugHelp")}
        maxLength={80}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        defaultValue={values?.slug ?? level?.slug ?? ""}
        error={errors?.slug}
        fieldClassName="max-w-md"
      />

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="max-sm:w-full">
          {level ? t("common.save") : t("common.create")}
        </SubmitButton>
        <Link
          href={routes.trainerLevels}
          className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
