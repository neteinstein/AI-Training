"use client";

import { useLocale } from "next-intl";

/** Hidden field that tells a Server Action which language the form was shown in. */
export function LocaleField() {
  const locale = useLocale();
  return <input type="hidden" name="locale" value={locale} />;
}
