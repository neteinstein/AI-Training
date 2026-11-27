import { z } from "zod";
import { locales } from "@/config/site";
import { isIsoDate } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { SLUG_PATTERN } from "@/lib/slug";

/**
 * Building blocks for form schemas.
 *
 * Every message is a key of the "Validation" translations (see messages/*.json), so one
 * schema serves both languages; `fieldErrors()` turns the keys into text.
 */

export const requiredText = (max: number) =>
  z.string("required").trim().min(1, "required").max(max, "tooLong");

export const optionalText = (max: number) => z.string("required").trim().max(max, "tooLong");

/** Long text (Markdown): only the length is checked; spacing is left alone. */
export const longText = (max: number) => z.string("required").max(max, "tooLong");

export const email = z
  .string("required")
  .trim()
  .toLowerCase()
  .min(1, "required")
  .pipe(z.email("email"));

export const slug = z
  .string("required")
  .trim()
  .toLowerCase()
  .min(1, "required")
  .max(80, "tooLong")
  .regex(SLUG_PATTERN, "slug");

/** A day, as a date input sends it (YYYY-MM-DD). */
export const requiredDate = z
  .string("required")
  .trim()
  .min(1, "required")
  .refine(isIsoDate, "date");

/** An id chosen from a list. An empty or malformed value reads "choose an option". */
export const chosenId = z.string("required").refine(isUuid, "choose");

/** An optional choice: "" means none. */
export const optionalId = z
  .string("required")
  .refine((value) => value === "" || isUuid(value), "choose")
  .transform((value) => (value === "" ? null : value));

export const localeChoice = z.enum(locales, "choose");

/** "" (not set), "pt" or "en". */
export const optionalLocale = z
  .enum(["", ...locales], "choose")
  .transform((value) => (value === "" ? null : value));
