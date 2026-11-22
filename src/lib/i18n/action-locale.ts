import { hasLocale } from "next-intl";
import { defaultLocale, type Locale } from "@/config/site";
import { routing } from "@/i18n/routing";

/**
 * Server Actions cannot read the language from the URL, so every form sends it in a hidden
 * field (see <LocaleField />). Anything unexpected falls back to the default language.
 */
export function localeFromForm(formData: FormData): Locale {
  const value = formData.get("locale");
  return hasLocale(routing.locales, value) ? value : defaultLocale;
}
