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
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function keepQuery(
    event: MouseEvent<HTMLAnchorElement>,
    locale: (typeof routing.locales)[number],
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    router.replace(`${pathname}${window.location.search}`, { locale });
  }

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
            aria-label={t(`Languages.${locale}`)}
            onClick={(event) => keepQuery(event, locale)}
            className={cn(
              "flex min-h-[38px] items-center rounded-full px-3.5 text-[0.8125rem] font-semibold no-underline transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {locale.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
