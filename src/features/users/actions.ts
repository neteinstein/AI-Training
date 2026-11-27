"use server";

import { refresh } from "next/cache";
import { updateProfile } from "@/features/account/operations";
import { chosenEditions, editionField } from "@/features/enrollments/fields";
import { inviteFromRequest } from "@/features/requests/operations";
import { redirect } from "@/i18n/navigation";
import type { ActionState } from "@/lib/actions/state";
import { failed, leaveNotice, succeeded, trainerAction } from "@/lib/actions/trainer";
import { fieldErrors, text, textList } from "@/lib/actions/validation";
import { isUuid } from "@/lib/ids";
import { routes } from "@/lib/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  inviteUsers,
  issueAccessLink,
  MAX_INVITES_PER_REQUEST,
  removeUser,
  setUserRole,
  type InviteResult,
} from "./operations";
import { inviteSchema, profileSchema, roleSchema } from "./schemas";

/**
 * Form handlers for accounts: invitations, a person's details, role and access, and removal.
 *
 * Several of them need the secret key, for the sign-in service's admin functions. It is only
 * created after the trainer check, and the operations check the trainer's session once more
 * before using it.
 */

export type InviteState = ActionState & {
  /** What happened for each address, to show after the form was sent. */
  results?: InviteResult[];
};

/** Invites one or several people, or the person behind an information request. */
export async function invitePeople(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { user, supabase, t, tv } = await trainerAction(formData);
  const courseIds = textList(formData, "course_ids");
  // Which edition of each course, where the form offered a choice.
  const editionIds = chosenEditions(formData, courseIds);
  const mode = text(formData, "mode") === "link" ? "link" : "email";
  const values: Record<string, string> = {
    emails: text(formData, "emails"),
    full_name: text(formData, "full_name"),
    language: text(formData, "language"),
    role: text(formData, "role"),
    mode,
    course_ids: courseIds.join(","),
    ...Object.fromEntries(
      Object.entries(editionIds).map(([courseId, editionId]) => [
        editionField(courseId),
        editionId,
      ]),
    ),
  };

  // From a request: the name, address and language are the ones the person gave.
  const requestId = text(formData, "request_id");
  if (requestId) {
    const result = await inviteFromRequest(createSupabaseAdminClient(), supabase, {
      requestId,
      courseIds: courseIds.filter(isUuid),
      editionIds,
      mode,
      invitedBy: user.id,
    });
    refresh();
    if (!result) return failed(t("common.gone"), { values });
    return {
      status: result.outcome === "failed" ? "error" : "success",
      message: t("users.resultsSummary", { count: 1 }),
      results: [result],
      values,
    };
  }

  const parsed = inviteSchema.safeParse({
    emails: values.emails,
    full_name: values.full_name,
    locale: values.language,
    role: values.role,
    course_ids: courseIds,
    mode,
  });
  if (!parsed.success) {
    const { locale: language, ...errors } = fieldErrors(parsed.error, tv, {
      max: MAX_INVITES_PER_REQUEST,
    });
    return failed(t("common.checkFields"), {
      fieldErrors: language ? { ...errors, language } : errors,
      values,
    });
  }

  const results = await inviteUsers(createSupabaseAdminClient(), supabase, {
    ...parsed.data,
    editionIds,
    invitedBy: user.id,
  });
  refresh();
  const failures = results.filter((result) => result.outcome === "failed");
  return {
    status: failures.length === results.length ? "error" : "success",
    message: t("users.resultsSummary", { count: results.length }),
    results,
    // The form comes back ready for the next invitation: same choices, and only the
    // addresses that did not work, to try again.
    values: { ...values, full_name: "", emails: failures.map((result) => result.email).join("\n") },
  };
}

/** A trainer corrects someone's name or language. */
export async function saveUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, t, tv } = await trainerAction(formData);
  const values = { full_name: text(formData, "full_name"), language: text(formData, "language") };
  const parsed = profileSchema.safeParse({ full_name: values.full_name, locale: values.language });
  if (!parsed.success) {
    const { locale: language, ...errors } = fieldErrors(parsed.error, tv);
    return failed(t("common.checkFields"), {
      fieldErrors: language ? { ...errors, language } : errors,
      values,
    });
  }

  const saved = await updateProfile(supabase, text(formData, "id"), parsed.data);
  refresh();
  return saved ? succeeded(t("users.saved"), { values }) : failed(t("common.failed"), { values });
}

export async function changeUserRole(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const role = roleSchema.safeParse(text(formData, "role"));
  if (!role.success) return failed(t("common.failed"));

  const result = await setUserRole(supabase, user.id, text(formData, "id"), role.data);
  refresh();
  switch (result) {
    case "ok":
      return succeeded(t("users.roleChanged"));
    case "self":
      return failed(t("users.roleSelf"));
    case "last_trainer":
      return failed(t("users.lastTrainer"));
    case "not_found":
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}

export type LinkState = ActionState & { link?: string; linkType?: "invite" | "recovery" };

/** A fresh one-time link for someone who cannot get in. Nothing is emailed. */
export async function createAccessLink(
  _previous: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const { user, supabase, t } = await trainerAction(formData);
  const link = await issueAccessLink(
    createSupabaseAdminClient(),
    supabase,
    user.id,
    text(formData, "id"),
  );
  if (!link) return failed(t("users.linkFailed"));
  return { status: "success", link: link.link, linkType: link.type };
}

/** Sends the invitation email again to someone who has not accepted it yet. */
export async function resendInvitation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, supabase, t } = await trainerAction(formData);
  const id = text(formData, "id");
  if (!isUuid(id)) return failed(t("common.gone"));
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, locale, role, email_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (!profile || profile.email_confirmed_at) return failed(t("common.gone"));

  const [result] = await inviteUsers(createSupabaseAdminClient(), supabase, {
    emails: [profile.email],
    locale: profile.locale === "en" ? "en" : "pt",
    role: profile.role,
    courseIds: [],
    mode: "email",
    invitedBy: user.id,
  });
  return result?.emailSent ? succeeded(t("users.resent")) : failed(t("users.resendFailed"));
}

export async function deleteUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const { locale, user, supabase, t } = await trainerAction(formData);
  const result = await removeUser(
    createSupabaseAdminClient(),
    supabase,
    user.id,
    text(formData, "id"),
  );
  switch (result) {
    case "removed":
      await leaveNotice(t("users.removed"));
      return redirect({ href: routes.trainerUsers, locale });
    case "self":
      return failed(t("users.removeSelf"));
    case "last_trainer":
      return failed(t("users.lastTrainer"));
    case "not_found":
      return failed(t("common.gone"));
    default:
      return failed(t("common.failed"));
  }
}
