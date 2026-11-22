/**
 * Brand and catalogue settings that are not translated.
 * Translated copy lives in /messages; colours and fonts live in src/app/globals.css.
 */
export const siteConfig = {
  /** Shown in the header, page titles and emails. */
  name: "AI Training",
  /** Public contact address shown on the site. Leave empty to hide it. */
  contactEmail: "",
} as const;

export const locales = ["pt", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt";

/** Value for the HTML `lang` attribute: the Portuguese copy is European Portuguese. */
export const htmlLang: Record<Locale, string> = { pt: "pt-PT", en: "en" };

/** Colours a trainer can give an area. Keys match the `areas.color` check in the database. */
export const areaColors = [
  "forest",
  "terracotta",
  "ocean",
  "plum",
  "ochre",
  "indigo",
  "rose",
  "olive",
] as const;
export type AreaColor = (typeof areaColors)[number];

/** Icons a trainer can give an area (lucide names). */
export const areaIcons = [
  "shapes",
  "graduation-cap",
  "stethoscope",
  "heart-pulse",
  "scale",
  "briefcase",
  "building-2",
  "landmark",
  "flask-conical",
  "megaphone",
  "code",
  "users",
  "book-open",
  "palette",
  "wrench",
  "leaf",
] as const;
export type AreaIcon = (typeof areaIcons)[number];

/** Public origin of the app, without a trailing slash. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);
