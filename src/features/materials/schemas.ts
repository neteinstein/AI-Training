import { z } from "zod";
import { parseDocumentUrl, parseExternalLink, parseVideoUrl } from "@/lib/embeds/parse";
import { longText, optionalLocale, optionalText } from "@/lib/validation/rules";
import type { FileMaterialInput, MaterialInput, ModuleInput } from "./operations";

/**
 * Modules and materials need text in at least one language: trainers are not made to
 * translate everything, and the interface falls back to the language that exists.
 */
const inOneLanguage =
  <First extends string, Second extends string>(first: First, second: Second) =>
  (value: Record<First | Second, string>) =>
    value[first].trim() !== "" || value[second].trim() !== "";

export const TITLE_MAX = 200;
export const BODY_MAX = 100_000;

export const moduleFields = ["title_pt", "title_en", "description_pt", "description_en"] as const;

export const moduleSchema = z
  .object({
    title_pt: optionalText(TITLE_MAX),
    title_en: optionalText(TITLE_MAX),
    description_pt: optionalText(1000),
    description_en: optionalText(1000),
  })
  .refine(inOneLanguage("title_pt", "title_en"), { path: ["title_pt"], message: "oneLanguage" })
  .transform((value): ModuleInput => ({
    title: { pt: value.title_pt, en: value.title_en },
    description: { pt: value.description_pt, en: value.description_en },
  }));

/** Fields every kind of material has. `is_published` comes from a switch. */
export const detailFields = [
  "title_pt",
  "title_en",
  "description_pt",
  "description_en",
  "content_language",
] as const;

const details = {
  title_pt: optionalText(TITLE_MAX),
  title_en: optionalText(TITLE_MAX),
  description_pt: optionalText(1000),
  description_en: optionalText(1000),
  content_language: optionalLocale,
  is_published: z.boolean("required"),
};

type Details = {
  title_pt: string;
  title_en: string;
  description_pt: string;
  description_en: string;
  content_language: "pt" | "en" | null;
  is_published: boolean;
};

const toDetails = (value: Details) => ({
  title: { pt: value.title_pt, en: value.title_en },
  description: { pt: value.description_pt, en: value.description_en },
  contentLanguage: value.content_language,
  isPublished: value.is_published,
});

const titled = { path: ["title_pt"], message: "oneLanguage" };

/** An address field checked by the same parser that later builds the frame or the link. */
const address = (accepts: (value: string) => unknown, message: string) =>
  z
    .string("required")
    .trim()
    .min(1, "required")
    .max(2000, "tooLong")
    .refine((value) => accepts(value) !== null, message);

const withUrl = <Kind extends "video" | "embed" | "link">(
  kind: Kind,
  accepts: (value: string) => unknown,
  message: string,
) =>
  z
    .object({ ...details, url: address(accepts, message) })
    .refine(inOneLanguage("title_pt", "title_en"), titled)
    .transform((value): MaterialInput => ({ kind, url: value.url, ...toDetails(value) }));

export const materialSchemas = {
  video: withUrl("video", parseVideoUrl, "videoUrl"),
  embed: withUrl("embed", parseDocumentUrl, "documentUrl"),
  link: withUrl("link", parseExternalLink, "url"),
  page: z
    .object({ ...details, body_pt: longText(BODY_MAX), body_en: longText(BODY_MAX) })
    .refine(inOneLanguage("title_pt", "title_en"), titled)
    .refine(inOneLanguage("body_pt", "body_en"), { path: ["body_pt"], message: "oneLanguage" })
    .transform((value): MaterialInput => ({
      kind: "page",
      body: { pt: value.body_pt, en: value.body_en },
      ...toDetails(value),
    })),
} as const;

export type EditableKind = keyof typeof materialSchemas;

export function isEditableKind(value: unknown): value is EditableKind {
  return typeof value === "string" && Object.hasOwn(materialSchemas, value);
}

/** Title and settings of an uploaded file (the file itself is handled separately). */
export const fileDetailsSchema = z
  .object(details)
  .refine(inOneLanguage("title_pt", "title_en"), titled)
  .transform(toDetails);

/** A new uploaded file: where the browser put it, and what it was called. */
export const fileMaterialSchema = z
  .object({
    ...details,
    module_id: z.string("required").min(1, "required"),
    storage_path: z.string("required").min(1, "fileRequired"),
    original_name: z.string("required").min(1, "fileRequired").max(300, "tooLong"),
  })
  .refine(inOneLanguage("title_pt", "title_en"), titled)
  .transform((value): FileMaterialInput => ({
    moduleId: value.module_id,
    storagePath: value.storage_path,
    originalName: value.original_name,
    ...toDetails(value),
  }));
