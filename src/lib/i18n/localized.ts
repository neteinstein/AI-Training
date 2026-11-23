import { locales, type Locale } from "@/config/site";

export type LocalizedValue = {
  value: string;
  /** Language the value is actually written in. */
  lang: Locale;
  /** True when the requested language was empty and the other one is shown instead. */
  isFallback: boolean;
};

/**
 * Reads a bilingual database field (`title_pt` / `title_en`) for a language. When that
 * language is empty, the other one is returned and flagged, so the interface can mark the
 * text with the right `lang` attribute.
 */
export function localized(
  row: Record<string, unknown> | null | undefined,
  field: string,
  locale: Locale,
): LocalizedValue {
  if (row) {
    for (const lang of [locale, ...locales.filter((candidate) => candidate !== locale)]) {
      const value = row[`${field}_${lang}`];
      if (typeof value === "string" && value.trim() !== "") {
        return { value, lang, isFallback: lang !== locale };
      }
    }
  }
  return { value: "", lang: locale, isFallback: false };
}

/** Just the text of a bilingual field, with fallback. */
export function pickLocalized(
  row: Record<string, unknown> | null | undefined,
  field: string,
  locale: Locale,
): string {
  return localized(row, field, locale).value;
}

/**
 * Languages a text has not been translated into: empty there, written in the other language.
 * A field that is empty in both languages is not a gap, just an optional text left out.
 */
export function translationGaps(
  row: Record<string, unknown> | null | undefined,
  fields: string[],
): Locale[] {
  const has = (field: string, lang: Locale) => {
    const value = row?.[`${field}_${lang}`];
    return typeof value === "string" && value.trim() !== "";
  };
  return locales.filter((lang) =>
    fields.some(
      (field) => !has(field, lang) && locales.some((other) => other !== lang && has(field, other)),
    ),
  );
}
