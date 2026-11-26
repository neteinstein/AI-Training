"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { LoaderCircle } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { LocaleField } from "@/components/forms/locale-field";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import { actionLooks, type ButtonLook } from "./looks";
import { useNoticeAction } from "./use-notice-action";
import { keepTabInside } from "./dialog-focus";

/** Unavailable buttons stay focusable, so the keyboard never loses its place in a list. */
const unavailable =
  "aria-disabled:text-glyph-rest aria-disabled:cursor-default aria-disabled:hover:bg-transparent";

export type ConfirmText = {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
};

export type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type ActionButtonProps = {
  /** A Server Action; its answer is shown as a message, and it refreshes the page itself. */
  action: FormAction;
  /** Hidden values sent with the action, usually ids. */
  fields?: Record<string, string>;
  children: ReactNode;
  look?: ButtonLook;
  /** Accessible name, for buttons that only show an icon. */
  label?: string;
  /** Shown but not available, e.g. "move up" on the first item. */
  disabled?: boolean;
  /** Ask before running: for anything that deletes. */
  confirm?: ConfirmText;
  /** Announce a confirmation to screen readers without showing it (after reordering). */
  quiet?: boolean;
  className?: string;
  /** Extra attributes for the button, e.g. role="switch" and aria-checked. */
  buttonProps?: Record<string, string | boolean | undefined>;
};

/**
 * A button that runs one Server Action: move up, toggle, delete. It is a real form, so it
 * also works before the page's scripts have loaded; with `confirm` it asks first.
 */
export function ActionButton({
  action,
  fields,
  children,
  look,
  label,
  disabled = false,
  confirm,
  quiet = false,
  className,
  buttonProps,
}: ActionButtonProps) {
  const form = useRef<HTMLFormElement>(null);
  const [asking, setAsking] = useState(false);
  const [formAction, pending] = useNoticeAction(action, { quiet });

  const hidden = (
    <>
      <LocaleField />
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
  const blocked = disabled || pending;
  const spinner =
    pending && look !== "icon" && look !== "bare" ? (
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
    ) : null;

  if (!confirm) {
    return (
      <form action={formAction} className="contents">
        {hidden}
        <button
          type="submit"
          aria-label={label}
          aria-disabled={blocked || undefined}
          onClick={(event) => {
            if (blocked) event.preventDefault();
          }}
          className={cn(
            actionLooks[look ?? "icon"],
            unavailable,
            pending && "opacity-60",
            className,
          )}
          {...buttonProps}
        >
          {spinner}
          {children}
        </button>
      </form>
    );
  }

  return (
    <>
      <form ref={form} action={formAction} hidden>
        {hidden}
      </form>
      <AlertDialog.Root open={asking} onOpenChange={setAsking}>
        <AlertDialog.Trigger
          aria-label={label}
          aria-disabled={blocked || undefined}
          onClick={(event) => {
            if (blocked) event.preventDefault();
          }}
          className={cn(
            actionLooks[look ?? "danger"],
            unavailable,
            pending && "opacity-60",
            className,
          )}
        >
          {spinner}
          {children}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Popup
            onKeyDown={keepTabInside}
            className="bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-2xl p-6 shadow-(--shadow-raised) transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            <AlertDialog.Title className="font-heading text-[1.375rem] leading-tight">
              {confirm.title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-muted-foreground">
              {confirm.text}
            </AlertDialog.Description>
            <div className="mt-2 flex flex-wrap justify-end gap-3">
              <AlertDialog.Close className={actionLooks.neutral}>
                {confirm.cancelLabel}
              </AlertDialog.Close>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setAsking(false);
                  form.current?.requestSubmit();
                }}
              >
                {confirm.confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
