import type { Locale } from "@/config/site";
import { confirmUrl } from "@/lib/auth/links";
import { PG } from "@/lib/dal/mutations";
import type { Client, UserRole } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";

/**
 * User management that needs the Auth admin API. Every function takes two clients:
 *   - `admin`: the secret-key client, used only for Auth admin calls;
 *   - `trainer`: the calling trainer's own client, so everything else (reading profiles,
 *     enrolments, role changes) still goes through Row Level Security.
 * Each function first confirms that the `trainer` client really is a trainer's session, so the
 * secret key is never used on behalf of anyone else, whatever the caller forgot to check.
 */

/**
 * True when `client` is signed in as a trainer. Row Level Security makes the answer reliable:
 * a learner can read no profile but their own, so a trainer's row only comes back for a trainer.
 */
export async function isTrainerSession(client: Client, callerId: string): Promise<boolean> {
  const { data } = await client
    .from("profiles")
    .select("id")
    .eq("id", callerId)
    .eq("role", "trainer")
    .maybeSingle();
  return Boolean(data);
}

export type InviteMode = "email" | "link";

export type InviteInput = {
  emails: string[];
  /** Only applied when a single address is invited. */
  fullName?: string;
  locale: Locale;
  role: UserRole;
  courseIds: string[];
  mode: InviteMode;
  invitedBy: string;
};

export type InviteResult = {
  email: string;
  /**
   * invited:   a new account was created
   * reinvited: the address had a pending invitation; a fresh one was issued
   * enrolled:  the address already had an active account; only courses (and role) changed
   * failed:    nothing was done for this address
   */
  outcome: "invited" | "reinvited" | "enrolled" | "failed";
  /** True when Supabase sent the invitation email. */
  emailSent: boolean;
  /** Activation link to pass on by hand, when no email was sent. */
  link?: string;
};

export const MAX_INVITES_PER_REQUEST = 100;

/** Lower-cases, trims and de-duplicates a list of addresses. */
export function normaliseEmails(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

async function inviteOne(
  admin: Client,
  trainer: Client,
  email: string,
  input: InviteInput,
): Promise<InviteResult> {
  const failed: InviteResult = { email, outcome: "failed", emailSent: false };

  const { data: existing, error: lookupError } = await trainer
    .from("profiles")
    .select("id, email_confirmed_at")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) return failed;

  const metadata = {
    locale: input.locale,
    ...(input.fullName ? { full_name: input.fullName } : {}),
  };

  let userId: string;
  let result: InviteResult;

  if (existing?.email_confirmed_at) {
    // Already active: no invitation, just the courses and role below.
    userId = existing.id;
    result = { email, outcome: "enrolled", emailSent: false };
  } else {
    const outcome = existing ? "reinvited" : "invited";
    let emailSent = false;
    let link: string | undefined;
    let invitedId: string | undefined;

    if (existing) {
      // A repeated invitation keeps the stored name and language, so update them first: the
      // email is written in the language found on the account.
      const updated = await admin.auth.admin.updateUserById(existing.id, {
        user_metadata: metadata,
      });
      if (updated.error) return failed;
      await trainer
        .from("profiles")
        .update({ locale: input.locale, ...(input.fullName ? { full_name: input.fullName } : {}) })
        .eq("id", existing.id);
    }

    if (input.mode === "email") {
      const sent = await admin.auth.admin.inviteUserByEmail(email, { data: metadata });
      if (!sent.error && sent.data.user) {
        emailSent = true;
        invitedId = sent.data.user.id;
      }
    }

    if (!emailSent) {
      // No email was asked for, or sending failed (no mail provider, rate limit): produce a
      // link the trainer can pass on instead. This call sends nothing.
      const generated = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: metadata },
      });
      const token = generated.data.properties?.hashed_token;
      if (generated.error || !generated.data.user || !token) return failed;
      invitedId = generated.data.user.id;
      link = confirmUrl(input.locale, token, "invite");
    }

    userId = invitedId!;
    result = { email, outcome, emailSent, link };
  }

  if (input.role === "trainer") {
    const { error } = await trainer.rpc("set_user_role", { target: userId, new_role: "trainer" });
    if (error) return { ...result, outcome: "failed" };
  }

  if (input.courseIds.length > 0) {
    const { error } = await trainer.from("enrollments").upsert(
      input.courseIds.map((course_id) => ({
        user_id: userId,
        course_id,
        created_by: input.invitedBy,
      })),
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    );
    if (error) return { ...result, outcome: "failed" };
  }

  return result;
}

/** Invites (or enrols) each address in turn. One failure does not stop the others. */
export async function inviteUsers(
  admin: Client,
  trainer: Client,
  input: InviteInput,
): Promise<InviteResult[]> {
  const emails = normaliseEmails(input.emails).slice(0, MAX_INVITES_PER_REQUEST);
  if (!(await isTrainerSession(trainer, input.invitedBy))) {
    return emails.map((email) => ({ email, outcome: "failed", emailSent: false }));
  }

  const single = emails.length === 1;
  const results: InviteResult[] = [];
  for (const email of emails) {
    results.push(
      await inviteOne(admin, trainer, email, {
        ...input,
        fullName: single ? input.fullName : undefined,
      }),
    );
  }
  return results;
}

export type AccessLink = { link: string; type: "invite" | "recovery" };

/**
 * A fresh one-time link for an existing user: an invitation while the account is pending,
 * a password reset once it is active. Nothing is emailed.
 */
export async function issueAccessLink(
  admin: Client,
  trainer: Client,
  actorId: string,
  userId: string,
): Promise<AccessLink | null> {
  if (!(await isTrainerSession(trainer, actorId))) return null;

  const { data: profile } = await trainer
    .from("profiles")
    .select("email, email_confirmed_at, locale")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const type = profile.email_confirmed_at ? "recovery" : "invite";
  const { data, error } = await admin.auth.admin.generateLink({ type, email: profile.email });
  const token = data.properties?.hashed_token;
  if (error || !token) return null;

  const locale: Locale = profile.locale === "en" ? "en" : "pt";
  return { link: confirmUrl(locale, token, type), type };
}

export type RemoveUserResult = "removed" | "self" | "last_trainer" | "not_found" | "failed";

/** Deletes an account with its profile and enrolments. */
export async function removeUser(
  admin: Client,
  trainer: Client,
  actorId: string,
  userId: string,
): Promise<RemoveUserResult> {
  if (!(await isTrainerSession(trainer, actorId))) return "failed";
  if (actorId === userId) return "self";

  const { data: profile } = await trainer
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return "not_found";

  if (profile.role === "trainer") {
    // Friendly answer up front; the database refuses as well.
    const { count } = await trainer
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "trainer");
    if ((count ?? 0) <= 1) return "last_trainer";
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  return error ? "failed" : "removed";
}

export type RoleResult = "ok" | "self" | "last_trainer" | "not_found" | "failed";

/**
 * Makes someone a trainer or a learner. A trainer cannot demote themselves (another trainer
 * has to do it), and the database refuses to demote the last trainer.
 */
export async function setUserRole(
  trainer: Client,
  actorId: string,
  userId: string,
  role: UserRole,
): Promise<RoleResult> {
  if (!isUuid(userId)) return "not_found";
  if (actorId === userId && role !== "trainer") return "self";

  const { error } = await trainer.rpc("set_user_role", { target: userId, new_role: role });
  if (!error) return "ok";
  if (error.code === PG.raised && error.hint === "last_trainer") return "last_trainer";
  if (error.code === PG.noData) return "not_found";
  return "failed";
}
