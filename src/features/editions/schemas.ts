import { z } from "zod";
import { isIsoDate } from "@/lib/dates";
import { requiredText } from "@/lib/validation/rules";
import { EDITION_NAME_MAX } from "./constants";
import type { EditionInput } from "./operations";

export const editionFields = ["name_pt", "name_en", "starts_on", "ends_on"] as const;

/** A day as a date field sends it ("2027-01-31"), or nothing. */
const optionalDay = z
  .string("required")
  .trim()
  .refine((value) => value === "" || isIsoDate(value), "date")
  .transform((value) => (value === "" ? null : value));

/**
 * An edition of a course. Its name is required in both languages, as a course's title is:
 * an edition can be shown on the public site.
 */
export const editionSchema = z
  .object({
    name_pt: requiredText(EDITION_NAME_MAX),
    name_en: requiredText(EDITION_NAME_MAX),
    starts_on: optionalDay,
    ends_on: optionalDay,
    is_listed: z.boolean("required"),
  })
  .superRefine((value, context) => {
    if (value.ends_on && !value.starts_on) {
      context.addIssue({ code: "custom", path: ["starts_on"], message: "startNeeded" });
    } else if (value.is_listed && !value.starts_on) {
      context.addIssue({ code: "custom", path: ["starts_on"], message: "startToList" });
    }
    if (value.starts_on && value.ends_on && value.ends_on < value.starts_on) {
      context.addIssue({ code: "custom", path: ["ends_on"], message: "endBeforeStart" });
    }
  })
  .transform((value): EditionInput => ({
    name: { pt: value.name_pt, en: value.name_en },
    startsOn: value.starts_on,
    endsOn: value.ends_on,
    isListed: value.is_listed,
  }));
