"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { idleState } from "@/lib/actions/state";
import { setPassword } from "./actions";
import { PASSWORD_MIN_LENGTH } from "./schemas";

export function SetPasswordForm({ email }: { email: string }) {
  const t = useTranslations("Auth.setPassword");
  const [state, formAction] = useActionState(setPassword, idleState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <LocaleField />
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <FormMessage state={state} />
      <TextField
        label={t("password")}
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
      <SubmitButton className="w-full">{t("submit")}</SubmitButton>
    </form>
  );
}
