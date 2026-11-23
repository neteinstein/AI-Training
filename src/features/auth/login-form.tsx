"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import { routes } from "@/lib/routes";
import { signIn } from "./actions";

export function LoginForm() {
  const t = useTranslations("Auth.signIn");
  const [state, formAction] = useActionState(signIn, idleState);
  // Where the visitor was heading when the proxy sent them here; validated on the server.
  const next = useSearchParams().get("next") ?? "";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <LocaleField />
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <TextField
        label={t("email")}
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
      <TextField
        label={t("password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
        after={
          <Link
            href={routes.forgotPassword}
            className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center self-start text-[0.9375rem] font-semibold no-underline"
          >
            {t("forgot")}
          </Link>
        }
      />
      <SubmitButton className="w-full">{t("submit")}</SubmitButton>
    </form>
  );
}
