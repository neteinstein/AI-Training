"use client";

import { Check, CircleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { AreaChip } from "@/components/catalog/area-chip";
import { AreaIcon } from "@/components/catalog/area-icon";
import { areaTone } from "@/components/catalog/area-style";
import { BilingualField } from "@/components/forms/bilingual-field";
import { FormMessage } from "@/components/forms/form-message";
import { LanguageTabs } from "@/components/forms/language-tabs";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { buttonClass } from "@/components/ui/button";
import { areaColors, areaIcons, type AreaColor } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import type { TrainerArea } from "@/lib/dal/trainer-queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { saveArea } from "./actions";

const focusWithin =
  "has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2";

/** Creates an area, or edits the one given. */
export function AreaForm({ area }: { area?: TrainerArea }) {
  const t = useTranslations("Trainer");
  const locale = useLocale();
  const [state, formAction] = useActionState(saveArea, idleState);
  const [color, setColor] = useState<AreaColor>(area?.color ?? "forest");
  const [icon, setIcon] = useState<string>(area?.icon ?? "shapes");
  const values = state.values;
  const errors = state.fieldErrors;
  const languages = { pt: t("common.portuguese"), en: t("common.english") };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <LocaleField />
      {area ? <input type="hidden" name="id" value={area.id} /> : null}
      <FormMessage state={state} />

      <LanguageTabs
        label={t("common.editingLanguage")}
        languages={languages}
        errorSuffix={t("common.hasErrors")}
        initial={locale === "en" ? "en" : "pt"}
        errors={errors}
      >
        <BilingualField
          label={t("areas.name")}
          name="name"
          languages={languages}
          required
          maxLength={120}
          defaultValues={{
            pt: values?.name_pt ?? area?.name.pt,
            en: values?.name_en ?? area?.name.en,
          }}
          errors={{ pt: errors?.name_pt, en: errors?.name_en }}
        />
        <BilingualField
          label={t("areas.description")}
          name="description"
          languages={languages}
          hint={t("common.optional")}
          help={t("areas.descriptionHelp")}
          multiline
          rows={3}
          maxLength={600}
          defaultValues={{
            pt: values?.description_pt ?? area?.description.pt,
            en: values?.description_en ?? area?.description.en,
          }}
          errors={{ pt: errors?.description_pt, en: errors?.description_en }}
        />
      </LanguageTabs>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">{t("areas.color")}</legend>
        <div className="flex flex-wrap gap-2">
          {areaColors.map((option) => (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 pr-4 pl-2.5 text-sm font-semibold",
                areaTone[option],
                color === option ? "border-current" : "border-transparent",
                focusWithin,
              )}
            >
              <input
                type="radio"
                name="color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="flex size-5 items-center justify-center rounded-full bg-current"
              >
                {color === option ? (
                  <Check className="text-background size-3.5" strokeWidth={3} />
                ) : null}
              </span>
              {t(`areas.colors.${option}`)}
            </label>
          ))}
        </div>
        {errors?.color ? <ChoiceError>{errors.color}</ChoiceError> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">{t("areas.icon")}</legend>
        <div className="flex flex-wrap gap-2">
          {areaIcons.map((option) => (
            <label
              key={option}
              title={t(`areas.icons.${option}`)}
              className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-lg border-2",
                icon === option
                  ? "border-primary bg-accent text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted",
                focusWithin,
              )}
            >
              <input
                type="radio"
                name="icon"
                value={option}
                checked={icon === option}
                onChange={() => setIcon(option)}
                className="sr-only"
              />
              <AreaIcon name={option} className="size-6" />
              <span className="sr-only">{t(`areas.icons.${option}`)}</span>
            </label>
          ))}
        </div>
        {errors?.icon ? <ChoiceError>{errors.icon}</ChoiceError> : null}
      </fieldset>

      <div className="flex flex-col items-start gap-2">
        <span className="text-sm font-semibold">{t("areas.preview")}</span>
        <AreaChip
          size="md"
          area={{
            name: area ? area.name[locale === "en" ? "en" : "pt"] : t("areas.sampleName"),
            color,
            icon,
          }}
        />
      </div>

      <TextField
        label={t("areas.slug")}
        name="slug"
        hint={t("common.optional")}
        help={t("areas.slugHelp")}
        maxLength={80}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        defaultValue={values?.slug ?? area?.slug ?? ""}
        error={errors?.slug}
        fieldClassName="max-w-md"
      />

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="max-sm:w-full">
          {area ? t("common.save") : t("common.create")}
        </SubmitButton>
        <Link
          href={routes.trainerAreas}
          className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}

function ChoiceError({ children }: { children: string }) {
  return (
    <p className="text-destructive flex items-center gap-1.5 text-sm font-semibold">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}
