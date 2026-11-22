import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/schemas";

export const passwordChangeSchema = z
  .object({
    current: z.string("required").min(1, "required"),
    password: z.string("required").min(1, "required").min(PASSWORD_MIN_LENGTH, "passwordMin"),
    confirm: z.string("required").min(1, "required"),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "passwordMismatch",
  })
  .refine((value) => value.password !== value.current, {
    path: ["password"],
    message: "passwordSame",
  });
