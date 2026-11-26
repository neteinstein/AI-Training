"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * PT | EN switch. Each option is a real link to the same page in the other language; with
 * JavaScript it also keeps the query string (for example the catalogue filters).
 */
type SiteLocale = (typeof routing.locales)[number];

/**
 * Click handler for a link to the same page in another language: plain links lose the query
 * string (for example the catalogue filters), so with JavaScript the switch keeps it.
 */
export function useSwitchLocale() {
  const pathname = usePathname();
  const router = useRouter();

  return function switchLocale(event: MouseEvent<HTMLAnchorElement>, locale: SiteLocale) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    router.replace(`${pathname}${window.location.search}`, { locale });
  };
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const keepQuery = useSwitchLocale();

  return (
    <div
      role="group"
      aria-label={t("Common.language")}
      className={cn("border-border bg-card inline-flex rounded-full border p-[3px]", className)}
    >
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            onClick={(event) => keepQuery(event, locale)}
            className={cn(
              "flex min-h-[38px] items-center rounded-full px-3.5 text-[0.8125rem] font-semibold no-underline transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {locale.toUpperCase()}
            {/* The name read aloud starts with the letters on screen, then says the language. */}
            <span className="sr-only"> ({t(`Languages.${locale}`)})</span>
          </Link>
        );
      })}
    </div>
  );
}
