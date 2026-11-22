import type { Locale } from "@/config/site";
import type { Client } from "@/lib/dal/types";
import { isUuid } from "@/lib/ids";

/**
 * A person's own details. `updateProfile` also serves the back-office: Row Level Security
 * lets people change their own row and trainers change anyone's. A database trigger copies
 * the name and language to the sign-in account, so emails follow the chosen language.
 */
export async function updateProfile(
  client: Client,
  userId: string,
  details: { fullName: string; locale: Locale },
): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const { data, error } = await client
    .from("profiles")
    .update({ full_name: details.fullName.trim().slice(0, 200), locale: details.locale })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export type PasswordResult = "ok" | "wrong_password" | "same_password" | "weak" | "failed";

/**
 * Changes the signed-in person's password after checking that they know the current one.
 *
 * `session` is their own client. `verifier` must be a separate client with no session of its
 * own: the current password is tried there, so a wrong guess cannot disturb the real session.
 */
export async function changePassword(
  session: Client,
  verifier: Client,
  input: { email: string; current: string; next: string },
): Promise<PasswordResult> {
  const attempt = await verifier.auth.signInWithPassword({
    email: input.email,
    password: input.current,
  });
  if (attempt.error) {
    return attempt.error.code === "invalid_credentials" ? "wrong_password" : "failed";
  }
  // The check opened a session of its own; close just that one.
  await verifier.auth.signOut({ scope: "local" });

  const { error } = await session.auth.updateUser({ password: input.next });
  if (!error) return "ok";
  if (error.code === "same_password") return "same_password";
  if (error.code === "weak_password") return "weak";
  return "failed";
}
