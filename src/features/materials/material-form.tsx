"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { BilingualField } from "@/components/forms/bilingual-field";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormMessage } from "@/components/forms/form-message";
import { LanguageTabs } from "@/components/forms/language-tabs";
import { LocaleField } from "@/components/forms/locale-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import type { EditableMaterial } from "@/lib/dal/trainer-queries";
import type { MaterialKind } from "@/lib/dal/types";
import { routes } from "@/lib/routes";
import { saveMaterial } from "./actions";
import { BodyField } from "./body-field";
import { TITLE_MAX } from "./constants";
import { UploadField } from "./upload-field";

/** Adds a material of one kind to a module, or edits an existing material. */
export function MaterialForm({
  courseId,
  kind,
  moduleId,
  material,
  currentFile,
}: {
  courseId: string;
  kind: MaterialKind;
  /** For a new material: the module it goes into. */
  moduleId?: string;
  /** For editing. */
  material?: EditableMaterial;
  currentFile?: { name: string; details: string; downloadHref: string };
}) {
  const t = useTranslations("Trainer");
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(saveMaterial, idleState);
  const values = state.values;
  const errors = state.fieldErrors;
  const languages = { pt: t("common.portuguese"), en: t("common.english") };
  const backHref = material
    ? routes.trainerCourseModule(courseId, material.moduleId)
    : moduleId
      ? routes.trainerCourseModule(courseId, moduleId)
      : routes.trainerCourseContent(courseId);

  /** A file's name, without its extension, is a fair first title. */
  function proposeTitle(fileName: string) {
    const fields = form.current?.elements;
    const pt = fields?.namedItem("title_pt");
    const en = fields?.namedItem("title_en");
    if (!(pt instanceof HTMLInputElement) || !(en instanceof HTMLInputElement)) return;
    if (pt.value.trim() !== "" || en.value.trim() !== "") return;
    (locale === "en" ? en : pt).value = fileName
      .replace(/\.[A-Za-z0-9]{1,8}$/, "")
      .slice(0, TITLE_MAX);
  }

  return (
    <form ref={form} action={formAction} noValidate className="flex flex-col gap-6">
      <LocaleField />
      <input type="hidden" name="kind" value={kind} />
      {material ? (
        <input type="hidden" name="id" value={material.id} />
      ) : (
        <input type="hidden" name="module_id" value={moduleId ?? ""} />
      )}
      <FormMessage state={state} />

      {kind === "file" ? (
        <UploadField
          moduleId={moduleId}
          materialId={material?.id}
          current={currentFile}
          error={errors?.file}
          onChosen={proposeTitle}
        />
      ) : null}

      {kind === "video" || kind === "embed" || kind === "link" ? (
        <TextField
          label={t(`content.url.${kind}`)}
          name="url"
          type="url"
          inputMode="url"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={2000}
          placeholder="https://"
          help={t(`content.urlHelp.${kind}`)}
          defaultValue={values?.url ?? material?.url ?? ""}
          error={errors?.url}
        />
      ) : null}

      <LanguageTabs
        label={t("common.editingLanguage")}
        languages={languages}
        errorSuffix={t("common.hasErrors")}
        initial={locale === "en" ? "en" : "pt"}
        errors={errors}
      >
        <BilingualField
          label={t("content.title")}
          name="title"
          languages={languages}
          help={t("content.oneLanguage")}
          maxLength={TITLE_MAX}
          defaultValues={{
            pt: values?.title_pt ?? material?.title.pt,
            en: values?.title_en ?? material?.title.en,
          }}
          errors={{ pt: errors?.title_pt, en: errors?.title_en }}
        />
        {kind === "page" ? (
          <BodyField
            languages={languages}
            defaults={{
              pt: values?.body_pt ?? material?.body.pt ?? "",
              en: values?.body_en ?? material?.body.en ?? "",
            }}
            errors={{ pt: errors?.body_pt, en: errors?.body_en }}
          />
        ) : null}
        <BilingualField
          label={t("content.description")}
          name="description"
          languages={languages}
          hint={t("common.optional")}
          help={t("content.descriptionHelp")}
          multiline
          rows={2}
          maxLength={1000}
          defaultValues={{
            pt: values?.description_pt ?? material?.description.pt,
            en: values?.description_en ?? material?.description.en,
          }}
          errors={{ pt: errors?.description_pt, en: errors?.description_en }}
        />
      </LanguageTabs>

      {/* A page is written here in both languages, so it has no single language of its own. */}
      {kind === "page" ? (
        <input type="hidden" name="content_language" value="" />
      ) : (
        <SelectField
          label={t("content.contentLanguage")}
          name="content_language"
          help={t("content.contentLanguageHelp")}
          defaultValue={values?.content_language ?? material?.contentLanguage ?? ""}
          error={errors?.content_language}
          fieldClassName="max-w-md"
        >
          <option value="">{t("content.notSet")}</option>
          <option value="pt">{languages.pt}</option>
          <option value="en">{languages.en}</option>
        </SelectField>
      )}

      <div className="flex flex-col">
        <CheckboxField
          name="is_published"
          defaultChecked={values ? values.is_published === "on" : (material?.isPublished ?? true)}
        >
          <span className="text-foreground text-base font-semibold">
            {t("content.visibleLabel")}
          </span>
          <span className="block">{t("content.visibleHelp")}</span>
        </CheckboxField>
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="max-sm:w-full">
          {material ? t("common.save") : t("common.create")}
        </SubmitButton>
        <Link
          href={backHref}
          className={buttonClass({ variant: "ghost", className: "max-sm:w-full" })}
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
