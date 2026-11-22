import { z } from "zod";
import {
  email,
  localeChoice,
  optionalId,
  optionalText,
  requiredText,
} from "@/lib/validation/rules";
import type { InfoRequestInput } from "./operations";

export const infoRequestFields = ["name", "email", "organisation", "course_id", "message"] as const;

/**
 * Name of the form's hidden trap field. People never see it; programs that fill in every field
 * do, and their submission is quietly dropped.
 */
export const TRAP_FIELD = "website";

export const MESSAGE_MAX = 4000;

export const infoRequestSchema = z
  .object({
    name: requiredText(200),
    email,
    organisation: optionalText(200),
    course_id: optionalId,
    message: optionalText(MESSAGE_MAX),
    locale: localeChoice,
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
