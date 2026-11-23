"use server";

import { getTranslations } from "next-intl/server";
import type { ActionState } from "@/lib/actions/state";
import { checked, fieldErrors, fields, text } from "@/lib/actions/validation";
import { localeFromForm } from "@/lib/i18n/action-locale";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { submitInfoRequest } from "./operations";
import { infoRequestFields, infoRequestSchema, TRAP_FIELD } from "./schemas";

/**
 * The public "request information" form. Visitors cannot write to the database themselves:
 * this validates the request, applies the limits, and stores it with the secret key.
 */
export async function sendInfoRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Request" });
  const tv = await getTranslations({ locale, namespace: "Validation" });

  // A filled trap field means a program, not a person. Answer as if all went well.
  if (text(formData, TRAP_FIELD) !== "") return { status: "success" };

  const consent = checked(formData, "consent");
  const values = { ...fields(formData, infoRequestFields), consent: consent ? "on" : "" };

  const parsed = infoRequestSchema.safeParse({ ...values, locale, consent });
  if (!parsed.success) {
    return {
      status: "error",
      message: t("checkFields"),
      fieldErrors: fieldErrors(parsed.error, tv),
      values,
    };
  }

  const result = await submitInfoRequest(createSupabaseAdminClient(), parsed.data);
  if (result === "rate_limited") return { status: "error", message: t("tooMany"), values };
  if (result === "failed") return { status: "error", message: t("failed"), values };
  return { status: "success" };
}
