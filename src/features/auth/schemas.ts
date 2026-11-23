import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "./constants";

// Kept here too, so server code has one place to import from.
export { confirmTypes, isConfirmType, PASSWORD_MIN_LENGTH, type ConfirmType } from "./constants";

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
