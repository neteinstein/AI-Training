"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { failed, leaveNotice, succeeded, trainerAction } from "@/lib/actions/trainer";
import { fieldErrors, text } from "@/lib/actions/validation";
import { routes } from "@/lib/routes";
import { MESSAGE_MAX } from "./constants";
import { answerConversation, deleteConversation, markConversationAnswered } from "./operations";
import { messageSchema } from "./schemas";

/** Form handlers for the trainers' side of a conversation. Trainers only. */

/** A trainer answers a learner. */
export async function answerMessage(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t, tv } = await trainerAction(formData);
  const values = { body: text(formData, "body") };
  const parsed = messageSchema.safeParse(values);
  if (!parsed.success) {
    return failed(t("common.checkFields"), {
      fieldErrors: fieldErrors(parsed.error, tv, { max: MESSAGE_MAX }),
      values,
    });
  }

  const result = await answerConversation(
    supabase,
    text(formData, "conversation_id"),
    parsed.data.body,
  );
  switch (result) {
    case "sent":
      refresh();
      return succeeded(t("conversations.answered"));
    case "invalid":
      return failed(t("common.checkFields"), {
        fieldErrors: { body: tv("tooLong", { max: MESSAGE_MAX }) },
        values,
      });
    case "not_found":
      return failed(t("common.gone"), { values });
    default:
      return failed(t("common.failed"), { values });
  }
}

/** Takes a conversation off the list of those waiting: its last message needs no answer. */
export async function setConversationAside(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, t } = await trainerAction(formData);
  await markConversationAnswered(supabase, text(formData, "id"));
  // Done or already so (another trainer answered meanwhile): either way it no longer waits.
  refresh();
  return succeeded(t("conversations.setAside"));
}

/** Deletes a conversation and everything written in it. */
export async function removeConversation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { locale, supabase, t } = await trainerAction(formData);
  const result = await deleteConversation(supabase, text(formData, "id"));
  switch (result) {
    case "deleted":
      await leaveNotice(t("conversations.deleted"));
      return redirect({ href: routes.trainerConversations, locale });
    case "not_found":
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}
