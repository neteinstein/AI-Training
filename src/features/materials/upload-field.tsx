"use client";

import { CircleAlert, CircleCheck, Upload as UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { actionLooks } from "@/components/trainer/looks";
import { checkUpload, formatFileSize, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/files/rules";
import { cn } from "@/lib/utils";
import { requestUpload } from "./actions";

type Phase =
  | { step: "idle" }
  | { step: "uploading"; name: string; percent: number }
  | { step: "done"; name: string; size: number; storagePath: string }
  | { step: "error"; message: string };

type RunningUpload = { abort: (terminate?: boolean) => Promise<void> };

/**
 * Chooses a file and sends it straight from the browser to storage, showing progress. The
 * server first checks the file and answers with a token for that one upload; the form then
 * carries where the file went, and saving the form turns it into a material.
 */
export function UploadField({
  moduleId,
  materialId,
  current,
  error,
  onChosen,
}: {
  /** The module a new material will go into. */
  moduleId?: string;
  /** The material whose file is being replaced. */
  materialId?: string;
  /** The file the material has now, when editing. */
  current?: { name: string; details: string; downloadHref: string };
  /** A problem the server found with the file when the form was saved. */
  error?: string;
  /** Called with the file's name once it is accepted, e.g. to propose a title. */
  onChosen?: (fileName: string) => void;
}) {
  const t = useTranslations("Trainer.content.file");
  const locale = useLocale();
  const id = useId();
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  // Only the newest upload may report back: an earlier one may have been cancelled.
  const run = useRef(0);
  const running = useRef<RunningUpload | null>(null);
  const max = formatFileSize(MAX_UPLOAD_BYTES, locale);

  useEffect(
    () => () => {
      run.current += 1;
      void running.current?.abort(true).catch(() => {});
    },
    [],
  );

  async function start(file: File) {
    const mine = (run.current += 1);
    const mineStill = () => run.current === mine;

    const problem = checkUpload({ name: file.name, size: file.size });
    if (problem) {
      setPhase({
        step: "error",
        message: problem === "tooLarge" ? t(problem, { max }) : t(problem),
      });
      return;
    }

    setPhase({ step: "uploading", name: file.name, percent: 0 });
    try {
      const ticket = await requestUpload({
        locale,
        moduleId,
        materialId,
        fileName: file.name,
        sizeBytes: file.size,
      });
      if (!mineStill()) return;
      if (!ticket.ok) {
        setPhase({ step: "error", message: ticket.message });
        return;
      }

      const { Upload } = await import("tus-js-client");
      if (!mineStill()) return;
      const upload = new Upload(file, {
        endpoint: ticket.endpoint,
        headers: { "x-signature": ticket.token, "x-upsert": "false" },
        metadata: ticket.metadata,
        // The storage service takes files in pieces of exactly this size.
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: true,
        retryDelays: [0, 2000, 5000, 10000],
        // Nothing about the upload is kept in the browser after the page is left.
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        onProgress(sent, total) {
          if (!mineStill()) return;
          const percent = total > 0 ? Math.min(99, Math.floor((sent / total) * 100)) : 0;
          setPhase({ step: "uploading", name: file.name, percent });
        },
        onError() {
          if (mineStill()) setPhase({ step: "error", message: t("failed") });
        },
        onSuccess() {
          if (!mineStill()) return;
          setPhase({
            step: "done",
            name: file.name,
            size: file.size,
            storagePath: ticket.storagePath,
          });
          onChosen?.(file.name);
        },
      });
      running.current = upload;
      upload.start();
    } catch {
      if (mineStill()) setPhase({ step: "error", message: t("failed") });
    }
  }

  function reset() {
    run.current += 1;
    void running.current?.abort(true).catch(() => {});
    running.current = null;
    setPhase({ step: "idle" });
  }

  const problem = phase.step === "error" ? phase.message : error;
  const helpId = `${id}-help`;
  const errorId = problem ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm leading-snug font-semibold">
        {t("label")}
      </span>

      {current ? (
        <p className="text-muted-foreground text-sm">
          {t("current")}:{" "}
          <a href={current.downloadHref} className="font-semibold break-all">
            {current.name}
          </a>{" "}
          ({current.details})
        </p>
      ) : null}

      {/* Screen readers hear the start and the end, not every percentage. */}
      <p role="status" className="sr-only">
        {phase.step === "uploading" ? t("uploading", { name: phase.name }) : null}
        {phase.step === "done"
          ? t("uploaded", { name: phase.name, size: formatFileSize(phase.size, locale) })
          : null}
      </p>

      {phase.step === "uploading" ? (
        <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
          <input type="hidden" name="upload_pending" value="1" />
          <p className="font-semibold break-all">{t("uploading", { name: phase.name })}</p>
          <progress
            value={phase.percent}
            max={100}
            aria-labelledby={`${id}-label`}
            className="[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary bg-muted h-2 w-full appearance-none overflow-hidden rounded-full"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <span aria-hidden="true" className="text-muted-foreground text-sm tabular-nums">
              {t("progress", { percent: phase.percent })}
            </span>
            <button type="button" onClick={reset} className={actionLooks.text}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : phase.step === "done" ? (
        <div className="bg-accent text-accent-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl py-1.5 pr-2 pl-4">
          <input type="hidden" name="storage_path" value={phase.storagePath} />
          <input type="hidden" name="original_name" value={phase.name} />
          <p className="flex min-w-0 items-center gap-2 font-medium">
            <CircleCheck aria-hidden="true" className="size-[18px] flex-none" />
            <span className="break-all">
              {t("uploaded", { name: phase.name, size: formatFileSize(phase.size, locale) })}
            </span>
          </p>
          <button type="button" onClick={reset} className={actionLooks.text}>
            {t("remove")}
          </button>
        </div>
      ) : (
        <label
          className={cn(
            actionLooks.neutral,
            "cursor-pointer self-start has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
            "has-[:focus-visible]:outline-ring",
          )}
        >
          <input
            type="file"
            accept={UPLOAD_ACCEPT}
            aria-labelledby={`${id}-label ${id}-button`}
            aria-describedby={[errorId, helpId].filter(Boolean).join(" ")}
            aria-invalid={problem ? true : undefined}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so that choosing the same file again is noticed.
              event.target.value = "";
              if (file) void start(file);
            }}
          />
          <UploadIcon aria-hidden="true" className="text-area-terracotta size-[18px]" />
          <span id={`${id}-button`}>{current ? t("replace") : t("choose")}</span>
        </label>
      )}

      {problem ? (
        <p
          id={errorId}
          role={phase.step === "error" ? "alert" : undefined}
          className="text-destructive flex items-center gap-1.5 text-sm font-semibold"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {problem}
        </p>
      ) : null}
      <p id={helpId} className="text-muted-foreground text-sm">
        {t("help", { max })}
      </p>
    </div>
  );
}
