import { z } from "zod";
import {
  email,
  localeChoice,
  optionalId,
  optionalText,
  requiredText,
} from "@/lib/validation/rules";
import { MESSAGE_MAX } from "./constants";
import type { InfoRequestInput } from "./operations";

// Kept here too, so server code has one place to import from.
export { infoRequestFields, MESSAGE_MAX, TRAP_FIELD } from "./constants";

export const infoRequestSchema = z
  .object({
    name: requiredText(200),
    email,
    organisation: optionalText(200),
    course_id: optionalId,
    message: optionalText(MESSAGE_MAX),
    locale: localeChoice,
    // The form's checkbox: without it we may not write back.
    consent: z.boolean("consent").refine((value) => value, "consent"),
  })
  .transform((value): InfoRequestInput => ({
    name: value.name,
    email: value.email,
    organisation: value.organisation || undefined,
    courseId: value.course_id ?? undefined,
    message: value.message || undefined,
    locale: value.locale,
  }));

export const requestStatusSchema = z.enum(["new", "contacted", "invited", "archived"], "choose");
