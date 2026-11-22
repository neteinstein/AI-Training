"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useSwitchLocale } from "./locale-switcher";

/** "English" on the Portuguese site and "Português" on the English one: the same page, translated. */
export function OtherLanguageLink({ className }: { className?: string }) {
  const t = useTranslations("Languages");
  const current = useLocale();
  const pathname = usePathname();
  const switchLocale = useSwitchLocale();
  const other = routing.locales.find((locale) => locale !== current) ?? routing.defaultLocale;

  return (
    <Link
      href={pathname}
      locale={other}
      hrefLang={other}
      lang={other}
      onClick={(event) => switchLocale(event, other)}
      className={className}
    >
      {t(other)}
    </Link>
  );
}
