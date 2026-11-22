import { z } from "zod";

/** Must match `minimum_password_length` in supabase/config.toml and the hosted project. */
export const PASSWORD_MIN_LENGTH = 10;

// Messages are keys of the "Validation" translations, resolved by fieldErrors().
const email = z.string("required").trim().min(1, "required").pipe(z.email("email"));

export const signInSchema = z.object({
  email,
  password: z.string("required").min(1, "required"),
});

export const emailSchema = z.object({ email });

export const setPasswordSchema = z
  .object({
    password: z.string("required").min(1, "required").min(PASSWORD_MIN_LENGTH, "passwordMin"),
    confirm: z.string("required").min(1, "required"),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "passwordMismatch",
  });

/** Kinds of emailed link the confirm page accepts. */
export const confirmTypes = ["invite", "recovery", "magiclink", "signup", "email"] as const;
export type ConfirmType = (typeof confirmTypes)[number];

export function isConfirmType(value: unknown): value is ConfirmType {
  return typeof value === "string" && (confirmTypes as readonly string[]).includes(value);
}
