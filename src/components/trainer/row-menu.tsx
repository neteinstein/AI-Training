"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import { useLocale } from "next-intl";
import { Fragment, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { idleState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";
import type { ConfirmText, FormAction } from "./action-button";
import { actionLooks } from "./looks";
import { showActionResult } from "./notice-store";

export type MenuEntry =
  | { type: "link"; label: string; href: string; icon?: ReactNode }
  | {
      type: "action";
      label: string;
      action: FormAction;
      fields: Record<string, string>;
      icon?: ReactNode;
      /** Shown in the colour of things that delete. */
      danger?: boolean;
      /** Ask before running. */
      confirm?: ConfirmText;
    }
  | { type: "heading"; label: string }
  | { type: "separator" };

type ActionEntry = Extract<MenuEntry, { type: "action" }>;

const item =
  "data-[highlighted]:bg-muted flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] font-medium no-underline outline-none select-none";

/**
 * The "more actions" button at the end of a row, with what it offers: links, actions, and
 * actions that ask first. Works with the keyboard as a menu does (arrows, Home, End, Escape).
 */
export function RowMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<ActionEntry | null>(null);

  function run(entry: ActionEntry) {
    const formData = new FormData();
    formData.set("locale", locale);
    for (const [name, value] of Object.entries(entry.fields)) formData.set(name, value);
    startTransition(async () => {
      showActionResult(await entry.action(idleState, formData));
    });
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={label}
          className={cn(actionLooks.icon, "data-[popup-open]:bg-muted", pending && "opacity-60")}
        >
          <Ellipsis aria-hidden="true" className="size-[18px]" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} className="z-50">
            <Menu.Popup className="border-border bg-card flex max-h-[min(24rem,var(--available-height))] w-64 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-2xl border p-1.5 shadow-(--shadow-raised) outline-none">
              {entries.map((entry, index) => {
                if (entry.type === "separator") {
                  return <Menu.Separator key={index} className="bg-border mx-2 my-1.5 h-px" />;
                }
                if (entry.type === "heading") {
                  return (
                    <div
                      key={index}
                      className="text-muted-foreground px-3 pt-2 pb-1 text-[0.8125rem] font-semibold"
                    >
                      {entry.label}
                    </div>
                  );
                }
                if (entry.type === "link") {
                  return (
                    <Menu.LinkItem
                      key={index}
                      closeOnClick
                      render={<Link href={entry.href} />}
                      className={cn(item, "text-foreground")}
                    >
                      {entry.icon}
                      {entry.label}
                    </Menu.LinkItem>
                  );
                }
                return (
                  <Menu.Item
                    key={index}
                    onClick={() => (entry.confirm ? setAsking(entry) : run(entry))}
                    className={cn(item, entry.danger ? "text-destructive" : "text-foreground")}
                  >
                    {entry.icon}
                    <span className="min-w-0 break-words">{entry.label}</span>
                  </Menu.Item>
                );
              })}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <AlertDialog.Root
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <AlertDialog.Popup className="bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-2xl p-6 shadow-(--shadow-raised) transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {asking?.confirm ? (
              <Fragment>
                <AlertDialog.Title className="font-heading text-[1.375rem] leading-tight">
                  {asking.confirm.title}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-muted-foreground">
                  {asking.confirm.text}
                </AlertDialog.Description>
                <div className="mt-2 flex flex-wrap justify-end gap-3">
                  <AlertDialog.Close className={actionLooks.neutral}>
                    {asking.confirm.cancelLabel}
                  </AlertDialog.Close>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const entry = asking;
                      setAsking(null);
                      run(entry);
                    }}
                  >
                    {asking.confirm.confirmLabel}
                  </Button>
                </div>
              </Fragment>
            ) : null}
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
