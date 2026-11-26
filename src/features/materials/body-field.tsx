"use client";

import { CircleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { controlClass } from "@/components/forms/field";
import { useActiveLanguage } from "@/components/forms/language-tabs";
import { cn } from "@/lib/utils";
import { BODY_MAX } from "./constants";

// The Markdown renderer is only fetched when a trainer asks for the preview.
const Markdown = dynamic(
  () => import("@/components/markdown/markdown").then((module) => module.Markdown),
  { loading: () => <p className="text-muted-foreground text-sm">…</p> },
);

type Texts = { pt: string; en: string };

/**
 * The text of a page, in both languages, written in Markdown. "Preview" shows it as learners
 * will read it, with the same renderer the learner area uses.
 */
export function BodyField({
  languages,
  defaults,
  errors,
}: {
  languages: Texts;
  defaults: Texts;
  errors?: { pt?: string; en?: string };
}) {
  const t = useTranslations("Trainer.content");
  const tm = useTranslations("Materials");
  const id = useId();
  const active = useActiveLanguage();
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [text, setText] = useState<Texts>(defaults);
  const helpId = `${id}-help`;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <legend className="float-left text-sm leading-snug font-semibold">{t("body")}</legend>
        <div
          role="group"
          aria-label={t("bodyMode")}
          className="border-border bg-muted inline-flex gap-1 rounded-xl border p-1"
        >
          {(["write", "preview"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "flex min-h-9 items-center rounded-lg px-3.5 text-sm font-semibold transition-colors",
                mode === option
                  ? "bg-card text-primary shadow-[0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(option)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(["pt", "en"] as const).map((language) => {
          const inputId = `${id}-${language}`;
          const error = errors?.[language];
          const errorId = error ? `${inputId}-error` : undefined;
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
                <span className="sr-only">{t("body")}: </span>
                {languages[language]}
              </label>
              {/* Kept in the form while the preview is shown, so its text is still sent. */}
              <textarea
                id={inputId}
                name={`body_${language}`}
                lang={language === "pt" ? "pt-PT" : "en"}
                value={text[language]}
                onChange={(event) => setText({ ...text, [language]: event.target.value })}
                hidden={mode === "preview"}
                rows={16}
                maxLength={BODY_MAX}
                spellCheck
                aria-invalid={error ? true : undefined}
                aria-describedby={[errorId, helpId].filter(Boolean).join(" ")}
                className={cn(
                  controlClass,
                  "min-h-48 resize-y py-2.5 font-mono text-[0.9375rem] leading-normal",
                )}
              />
              {mode === "preview" ? (
                <div
                  role="region"
                  aria-label={t("previewOf", { language: languages[language] })}
                  lang={language === "pt" ? "pt-PT" : "en"}
                  tabIndex={0}
                  className="border-border bg-card min-h-48 overflow-x-auto rounded-lg border px-4 py-3"
                >
                  {text[language].trim() === "" ? (
                    <p className="text-muted-foreground text-sm">{t("previewEmpty")}</p>
                  ) : (
                    <Markdown
                      copyLabels={{
                        copy: tm("copy"),
                        copied: tm("copied"),
                        prompt: tm("prompt"),
                      }}
                    >
                      {text[language]}
                    </Markdown>
                  )}
                </div>
              ) : null}
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
      <p id={helpId} className="text-muted-foreground text-sm">
        {t("bodyHelp")}
      </p>
    </fieldset>
  );
}
