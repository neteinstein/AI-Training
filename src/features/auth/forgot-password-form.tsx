"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { idleState } from "@/lib/actions/state";
import { requestPasswordReset } from "./actions";

/** Asks for a fresh emailed link. Also used on the "link no longer valid" screen. */
export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [state, formAction] = useActionState(requestPasswordReset, idleState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <LocaleField />
      <FormMessage state={state} />
      <TextField
        label={t("signIn.email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton className="w-full">{t("forgot.submit")}</SubmitButton>
    </form>
  );
}
