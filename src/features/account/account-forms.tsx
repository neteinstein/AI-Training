"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { locales } from "@/config/site";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/constants";
import { idleState } from "@/lib/actions/state";
import { changeOwnPassword, saveProfile } from "./actions";

export function ProfileForm({
  fullName,
  email,
  language,
}: {
  fullName: string;
  email: string;
  language: string;
}) {
  const t = useTranslations("Account");
  const tLanguages = useTranslations("Languages");
  const [state, formAction] = useActionState(saveProfile, idleState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <LocaleField />
      <FormMessage state={state} />
      <TextField
        label={t("name")}
        name="full_name"
        autoComplete="name"
        maxLength={200}
        defaultValue={state.values?.full_name ?? fullName}
        error={state.fieldErrors?.full_name}
      />
      {/* Shown for reference: the address is the person's sign-in name and is not edited here. */}
      <TextField
        label={t("email")}
        name="email"
        value={email}
        readOnly
        disabled
        help={t("emailHelp")}
      />
      <SelectField
        label={t("language")}
        name="language"
        defaultValue={state.values?.language ?? language}
        error={state.fieldErrors?.language}
        help={t("languageHelp")}
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {tLanguages(locale)}
          </option>
        ))}
      </SelectField>
      <SubmitButton className="self-start max-sm:w-full">{t("save")}</SubmitButton>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const t = useTranslations("Account");
  const [state, formAction] = useActionState(changeOwnPassword, idleState);

  return (
    // Remounting after success empties the three fields.
    <form
      key={state.status === "success" ? "done" : "editing"}
      action={formAction}
      noValidate
      className="flex flex-col gap-4"
    >
      <LocaleField />
      {/* Lets password managers attach the new password to the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      <FormMessage state={state} />
      <TextField
        label={t("current")}
        name="current"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.current}
      />
      <TextField
        label={t("new")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        help={t("help", { min: PASSWORD_MIN_LENGTH })}
        error={state.fieldErrors?.password}
      />
      <TextField
        label={t("confirm")}
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      <SubmitButton className="self-start max-sm:w-full">{t("change")}</SubmitButton>
    </form>
  );
}
