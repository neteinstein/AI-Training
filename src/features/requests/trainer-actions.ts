"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/lib/actions/state";
import { failed, succeeded, trainerAction } from "@/lib/actions/trainer";
import { text } from "@/lib/actions/validation";
import { deleteRequest, setRequestStatus } from "./operations";
import { requestStatusSchema } from "./schemas";

/**
 * What trainers do with information requests. (Sending one is the public form's action, in
 * actions.ts; inviting the person is part of the invitation form.)
 */

export async function changeRequestStatus(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const status = requestStatusSchema.safeParse(text(formData, "status"));
  if (!status.success) return failed(t("common.failed"));

  const done = await setRequestStatus(supabase, text(formData, "id"), status.data, user.id);
  refresh();
  return done ? succeeded(t("requests.updated")) : failed(t("common.gone"));
}

export async function removeRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  const done = await deleteRequest(supabase, text(formData, "id"));
  refresh();
  return done ? succeeded(t("requests.deleted")) : failed(t("common.gone"));
}
