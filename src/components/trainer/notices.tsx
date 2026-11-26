"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { clearNotice, noticeStore, showNotice, takeLeftNotice } from "./notice-store";

/** How long a confirmation stays on screen. Problems stay until they are closed. */
const CONFIRMATION_MS = 6000;

/**
 * Where the back-office shows the outcome of an action. Rendered once, in the layout. The two
 * live regions are always in the page, so screen readers announce a message when it appears:
 * confirmations politely, problems at once.
 */
export function Notices({ closeLabel }: { closeLabel: string }) {
  const notice = useSyncExternalStore(
    noticeStore.subscribe,
    noticeStore.get,
    noticeStore.getOnServer,
  );
  const pathname = usePathname();

  // An action that sent the person to this page may have left a message for it.
  useEffect(() => {
    const left = takeLeftNotice();
    if (left) showNotice(left);
  }, [pathname]);

  useEffect(() => {
    if (!notice || notice.status === "error") return;
    const timer = window.setTimeout(clearNotice, CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visible = notice && !notice.quiet ? notice : null;
  const isError = visible?.status === "error";

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {notice?.quiet ? notice.message : null}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
        <div role="status" aria-live="polite">
          {visible && !isError ? <Card notice={visible} closeLabel={closeLabel} /> : null}
        </div>
        <div role="alert" aria-live="assertive">
          {visible && isError ? <Card notice={visible} closeLabel={closeLabel} /> : null}
        </div>
      </div>
    </>
  );
}

function Card({
  notice,
  closeLabel,
}: {
  notice: { status: "success" | "error"; message: string };
  closeLabel: string;
}) {
  const isError = notice.status === "error";
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-xl border py-2 pr-1.5 pl-4 text-[0.9375rem] leading-normal font-medium shadow-(--shadow-raised)",
        isError
          ? "border-destructive bg-highlight-tint text-destructive"
          : "border-primary bg-accent text-accent-foreground",
      )}
    >
      {isError ? (
        <CircleAlert aria-hidden="true" className="mt-[13px] size-[18px] shrink-0" />
      ) : (
        <CircleCheck aria-hidden="true" className="mt-[13px] size-[18px] shrink-0" />
      )}
      <p className="min-w-0 flex-1 py-2.5 break-words">{notice.message}</p>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={clearNotice}
        className="flex size-11 flex-none items-center justify-center rounded-lg transition-colors hover:bg-black/5"
      >
        <X aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  );
}
