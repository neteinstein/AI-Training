"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ContentLanguage = "pt" | "en";

/** Which language's fields a narrow screen shows. Wide screens show both, side by side. */
const ActiveLanguage = createContext<ContentLanguage | null>(null);

export const useActiveLanguage = () => use(ActiveLanguage);

/**
 * Wraps the bilingual fields of a form. On a phone it adds a Portuguese / English switch and
 * shows one language at a time; both are always sent. When the server finds a problem only in
 * the language that is hidden, the switch moves to it.
 */
export function LanguageTabs({
  label,
  languages,
  errorSuffix,
  initial,
  errors,
  children,
}: {
  /** Name of the switch, e.g. "Language being edited". */
  label: string;
  languages: Record<ContentLanguage, string>;
  /** Added to a language that has problems, e.g. "has errors". */
  errorSuffix: string;
  initial: ContentLanguage;
  /** The form's field errors: names ending in _pt or _en belong to a language. */
  errors?: Record<string, string>;
  children: ReactNode;
}) {
  const names = Object.keys(errors ?? {});
  const hasErrors: Record<ContentLanguage, boolean> = {
    pt: names.some((name) => name.endsWith("_pt")),
    en: names.some((name) => name.endsWith("_en")),
  };
  const [active, setActive] = useState<ContentLanguage>(initial);
  const [seenErrors, setSeenErrors] = useState(errors);
  if (seenErrors !== errors) {
    setSeenErrors(errors);
    const other = active === "pt" ? "en" : "pt";
    if (!hasErrors[active] && hasErrors[other]) setActive(other);
  }

  return (
    <ActiveLanguage value={active}>
      <div
        role="group"
        aria-label={label}
        className="border-border bg-muted grid grid-cols-2 gap-1 rounded-xl border p-1 md:hidden"
      >
        {(["pt", "en"] as const).map((language) => (
          <button
            key={language}
            type="button"
            aria-pressed={active === language}
            onClick={() => setActive(language)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-[0.9375rem] font-semibold transition-colors",
              active === language
                ? "bg-card text-primary shadow-[0_0_0_1px_var(--border)]"
                : "text-muted-foreground",
            )}
          >
            {languages[language]}
            {hasErrors[language] ? (
              <>
                <span aria-hidden="true" className="bg-destructive size-2 rounded-full" />
                <span className="sr-only">{errorSuffix}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      {children}
    </ActiveLanguage>
  );
}
