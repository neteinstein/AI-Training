"use client";

import { CircleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { controlClass } from "./field";
import { useActiveLanguage } from "./language-tabs";

type BilingualFieldProps = {
  /** What the field is, e.g. "Title". Shown once, above both languages. */
  label: string;
  /** Base name: the inputs are sent as `${name}_pt` and `${name}_en`. */
  name: string;
  languages: { pt: string; en: string };
  defaultValues?: { pt?: string; en?: string };
  errors?: { pt?: string; en?: string };
  help?: ReactNode;
  hint?: ReactNode;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  /** For text written in Markdown: a fixed-width face helps with lists and tables. */
  mono?: boolean;
};

/**
 * One piece of text in the site's two languages: side by side on wide screens; on phones one
 * at a time, chosen with the switch of <LanguageTabs>. Each input is labelled with the field
 * and its language.
 */
export function BilingualField({
  label,
  name,
  languages,
  defaultValues,
  errors,
  help,
  hint,
  multiline = false,
  rows = 4,
  maxLength,
  required,
  mono,
}: BilingualFieldProps) {
  const id = useId();
  const active = useActiveLanguage();
  const helpId = help ? `${id}-help` : undefined;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-foreground mb-1.5 text-sm leading-snug font-semibold">
        {label}
        {hint ? <span className="text-muted-foreground font-normal"> {hint}</span> : null}
      </legend>
      <div className="grid gap-3 md:grid-cols-2">
        {(["pt", "en"] as const).map((language) => {
          const inputId = `${id}-${language}`;
          const error = errors?.[language];
          const errorId = error ? `${inputId}-error` : undefined;
          const shared = {
            id: inputId,
            name: `${name}_${language}`,
            lang: language === "pt" ? "pt-PT" : "en",
            defaultValue: defaultValues?.[language] ?? "",
            maxLength,
            required,
            "aria-invalid": error ? (true as const) : undefined,
            "aria-describedby": [errorId, helpId].filter(Boolean).join(" ") || undefined,
          };
          return (
            <div
              key={language}
              className={cn(
                "flex min-w-0 flex-col gap-1",
                active !== null && active !== language && "max-md:hidden",
              )}
            >
              <label
                htmlFor={inputId}
                className="text-muted-foreground text-[0.8125rem] font-semibold"
              >
                <span className="sr-only">{label}: </span>
                {languages[language]}
              </label>
              {multiline ? (
                <textarea
                  {...shared}
                  rows={rows}
                  className={cn(
                    controlClass,
                    "min-h-24 resize-y py-2.5 leading-normal",
                    mono && "font-mono text-[0.9375rem]",
                  )}
                />
              ) : (
                <Input {...shared} />
              )}
              {error ? (
                <p
                  id={errorId}
                  className="text-destructive flex items-center gap-1.5 text-sm font-semibold"
                >
                  <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {help ? (
        <p id={helpId} className="text-muted-foreground text-sm">
          {help}
        </p>
      ) : null}
    </fieldset>
  );
}
