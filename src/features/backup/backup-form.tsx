"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { buttonClass } from "@/components/ui/button";
import { routes } from "@/lib/routes";

/** By then the browser has taken the download over and shows its progress itself. */
const PREPARING_MS = 8000;

/**
 * The backup's options and its button. It is an ordinary form post, not a Server Action: the
 * answer is a ZIP file, which the browser saves without leaving the page. Should the backup
 * fail before it starts, the answer is this page again, with a message.
 */
export function BackupForm({
  files,
  people,
}: {
  files: { count: number; size: string };
  people: { people: number; requests: number };
}) {
  const t = useTranslations("Trainer.backup");
  const locale = useLocale();
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!preparing) return;
    const timer = window.setTimeout(() => setPreparing(false), PREPARING_MS);
    return () => window.clearTimeout(timer);
  }, [preparing]);

  return (
    <form
      method="post"
      action={routes.backupDownload}
      onSubmit={(event) => {
        if (preparing) event.preventDefault();
        else setPreparing(true);
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="flex flex-col gap-2">
        <legend className="font-heading mb-2 text-xl leading-tight">{t("optionsTitle")}</legend>
        <CheckboxField name="files" defaultChecked>
          <span className="text-foreground block font-semibold">
            {t("includeFiles", { count: files.count, size: files.size })}
          </span>
          <span className="block">{t("includeFilesHint")}</span>
        </CheckboxField>
        <CheckboxField name="people">
          <span className="text-foreground block font-semibold">
            {t("includePeople", { people: people.people, requests: people.requests })}
          </span>
          <span className="block">{t("includePeopleHint")}</span>
        </CheckboxField>
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="submit"
          aria-disabled={preparing || undefined}
          className={buttonClass({ className: "self-start" })}
        >
          {preparing ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {t("download")}
        </button>
        <p role="status" className="text-muted-foreground min-w-0 flex-1 text-sm">
          {preparing ? t("preparing") : null}
        </p>
      </div>
    </form>
  );
}
