import { z } from "zod";
import { areaColors, areaIcons } from "@/config/site";
import { optionalText, requiredText, slug } from "@/lib/validation/rules";
import type { AreaInput, LevelInput } from "./operations";

/** Field names of the area form, in the order they appear. */
export const areaFields = [
  "slug",
  "name_pt",
  "name_en",
  "description_pt",
  "description_en",
  "color",
  "icon",
] as const;

export const areaSchema = z
  .object({
    slug,
    name_pt: requiredText(120),
    name_en: requiredText(120),
    description_pt: optionalText(600),
    description_en: optionalText(600),
    color: z.enum(areaColors, "choose"),
    icon: z.enum(areaIcons, "choose"),
  })
  .transform((value): AreaInput => ({
    slug: value.slug,
    name: { pt: value.name_pt, en: value.name_en },
    description: { pt: value.description_pt, en: value.description_en },
    color: value.color,
    icon: value.icon,
  }));

export const levelFields = [
  "slug",
  "name_pt",
  "name_en",
  "description_pt",
  "description_en",
] as const;

export const levelSchema = z
  .object({
    slug,
    name_pt: requiredText(120),
    name_en: requiredText(120),
    description_pt: optionalText(600),
    description_en: optionalText(600),
  })
  .transform((value): LevelInput => ({
    slug: value.slug,
    name: { pt: value.name_pt, en: value.name_en },
    description: { pt: value.description_pt, en: value.description_en },
  }));
