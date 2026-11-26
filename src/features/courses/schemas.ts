import { z } from "zod";
import { chosenId, longText, optionalText, requiredText, slug } from "@/lib/validation/rules";
import { DESCRIPTION_MAX, SUMMARY_MAX } from "./constants";
import type { CourseInput } from "./operations";

export const courseFields = [
  "slug",
  "area_id",
  "level_id",
  "title_pt",
  "title_en",
  "summary_pt",
  "summary_en",
  "description_pt",
  "description_en",
  "duration_hours",
] as const;

/** Hours as people type them: "8", "7.5" or, in Portuguese, "7,5". Empty means not set. */
const durationHours = z
  .string("required")
  .trim()
  .refine((value) => value === "" || /^\d{1,3}([.,]\d)?$/.test(value), "duration")
  .transform((value) => (value === "" ? null : Number(value.replace(",", "."))))
  .refine((value) => value === null || (value >= 0.5 && value <= 999), "duration");

export const courseSchema = z
  .object({
    slug,
    area_id: chosenId,
    level_id: chosenId,
    title_pt: requiredText(160),
    title_en: requiredText(160),
    summary_pt: optionalText(SUMMARY_MAX),
    summary_en: optionalText(SUMMARY_MAX),
    description_pt: longText(DESCRIPTION_MAX),
    description_en: longText(DESCRIPTION_MAX),
    duration_hours: durationHours,
  })
  .transform((value): CourseInput => ({
    slug: value.slug,
    areaId: value.area_id,
    levelId: value.level_id,
    title: { pt: value.title_pt, en: value.title_en },
    summary: { pt: value.summary_pt, en: value.summary_en },
    description: { pt: value.description_pt, en: value.description_en },
    durationHours: value.duration_hours,
  }));

export const courseStatusSchema = z.enum(["draft", "published", "unlisted"], "choose");
