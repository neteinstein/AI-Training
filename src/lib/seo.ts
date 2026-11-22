import type { Metadata } from "next";
import { defaultLocale, locales, type Locale } from "@/config/site";

/**
 * Canonical address and language alternates for a public page, so search engines show each
 * visitor the version in their language. `path` is the page's path without the language.
 */
export function localizedAlternates(path: string, locale: Locale): Metadata["alternates"] {
  const suffix = path === "/" ? "" : path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: {
      ...Object.fromEntries(locales.map((language) => [language, `/${language}${suffix}`])),
      "x-default": `/${defaultLocale}${suffix}`,
    },
  };
}
