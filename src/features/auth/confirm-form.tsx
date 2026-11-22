"use client";

import { ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { LocaleField } from "@/components/forms/locale-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { siteConfig } from "@/config/site";
import { idleState } from "@/lib/actions/state";
import { confirmLink } from "./actions";
import { ForgotPasswordForm } from "./forgot-password-form";
import { isConfirmType } from "./schemas";

/**
 * The page an emailed link opens. Nothing happens until the person presses "Continue":
 * opening the page (as mail scanners do) leaves the one-time token untouched.
 */
export function ConfirmForm() {
  const t = useTranslations("Auth.confirm");
  const params = useSearchParams();
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") ?? "";
  const [state, formAction] = useActionState(confirmLink, idleState);

  const usable = tokenHash !== "" && isConfirmType(type) && state.status !== "error";

  if (!usable) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-heading text-[2rem] leading-[1.15] font-[550] tracking-[-0.02em]">
            {t("expiredTitle")}
          </h1>
          <p className="text-muted-foreground">{t("expiredText")}</p>
        </div>
        <ForgotPasswordForm />
      </div>
    );
  }

  const isInvite = type === "invite";

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label={t("steps")} className="flex items-center gap-2.5 text-sm font-semibold">
        <li aria-current="step" className="text-primary flex items-center gap-2">
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-[26px] items-center justify-center rounded-full text-[0.8125rem]"
          >
            1
          </span>
          {t("stepConfirm")}
        </li>
        <li aria-hidden="true" className="bg-input h-px flex-1" />
        <li className="text-muted-foreground flex items-center gap-2">
          <span
            aria-hidden="true"
            className="border-input flex size-[26px] items-center justify-center rounded-full border-[1.5px] text-[0.8125rem]"
          >
            2
          </span>
          {t("stepPassword")}
        </li>
      </ol>

      <div className="flex flex-col gap-2.5">
        <h1 className="font-heading text-[2rem] leading-[1.15] font-[550] tracking-[-0.02em]">
          {isInvite ? t("inviteTitle") : t("recoveryTitle")}
        </h1>
        <p className="text-muted-foreground">
          {isInvite ? t("inviteText", { site: siteConfig.name }) : t("recoveryText")}
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3.5">
        <LocaleField />
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <SubmitButton className="w-full">
          {t("continue")}
          <ArrowRight aria-hidden="true" />
        </SubmitButton>
        <p className="text-muted-foreground text-sm">{t("validity")}</p>
      </form>

      <p className="border-border text-muted-foreground mt-auto border-t pt-4 text-sm">
        {t("unexpected")}
      </p>
    </div>
  );
}
