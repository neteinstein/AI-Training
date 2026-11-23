/**
 * Values the sign-in forms need in the browser. This file must not import the validation
 * library: anything a Client Component imports ends up in the browser bundle.
 */

/** Must match `minimum_password_length` in supabase/config.toml and the hosted project. */
export const PASSWORD_MIN_LENGTH = 10;

/** Kinds of emailed link the confirm page accepts. */
export const confirmTypes = ["invite", "recovery", "magiclink", "signup", "email"] as const;
export type ConfirmType = (typeof confirmTypes)[number];

export function isConfirmType(value: unknown): value is ConfirmType {
  return typeof value === "string" && (confirmTypes as readonly string[]).includes(value);
}
