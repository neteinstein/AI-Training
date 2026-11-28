/**
 * Brand and catalogue settings. Only the name changes with the language.
 * Translated copy lives in /messages; colours and fonts live in src/app/globals.css.
 */
export const siteConfig = {
  /**
   * The platform's name in each language: shown in the header, page titles and link previews.
   * The emails spell it out themselves, in supabase/config.toml and supabase/templates.
   */
  name: { pt: "Formação em IA", en: "AI Training" } satisfies Record<Locale, string>,
  /** Public contact address shown on the site. Leave empty to hide it. */
  contactEmail: "",
  /** The company that runs the platform: credited in the footer and named in the privacy notice. */
  operator: {
    name: "Mindera",
    url: "https://mindera.com",
    privacyEmail: "dpo@mindera.com",
  },
  /**
   * The pictures link previews show (Slack, WhatsApp, LinkedIn...), in /public: one per
   * language, as the name is written on them. Drawn by `npm run og:image`; change the address
   * when a picture changes, as the networks keep the old one for a long time.
   */
  ogImage: {
    path: { pt: "/og-image-pt.png", en: "/og-image-en.png" } satisfies Record<Locale, string>,
    width: 1200,
    height: 630,
  },
} as const;

/**
 * Trainers shown on the landing page. `role` names a translation in Home.trainers.roles.
 * `photo` lives in public/trainers: a square 192 × 192 WebP, cropped to head and shoulders.
 */
export const trainers = [
  {
    name: "Pedro Vicente",
    role: "lead",
    photo: "/trainers/pedro-vicente.webp",
    linkedin: "https://www.linkedin.com/in/neteinstein/",
    website: "https://www.pedrovicente.pt",
  },
] as const;

export const locales = ["pt", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt";

/** Value for the HTML `lang` attribute: the Portuguese copy is European Portuguese. */
export const htmlLang: Record<Locale, string> = { pt: "pt-PT", en: "en" };

/** Value for the `og:locale` tag of link previews, which wants a language and a country. */
export const ogLocale: Record<Locale, string> = { pt: "pt_PT", en: "en_US" };

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
