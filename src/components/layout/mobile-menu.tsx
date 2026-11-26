"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NavLink } from "./nav-link";

/** `badge` is a count shown beside the label, with `badgeLabel` saying what it counts. */
export type MenuItem = { href: string; label: string; badge?: number; badgeLabel?: string };

/**
 * The navigation on phones: a button that opens a sheet with the links, and whatever else the
 * header shows on larger screens (language switch, sign-in or sign-out) passed as `footer`.
 */
export function MobileMenu({
  items,
  labels,
  footer,
  exactFirst = false,
  className,
}: {
  items: MenuItem[];
  labels: { open: string; close: string; title: string };
  footer?: ReactNode;
  /** The first item is a start page: it is only "current" on that exact page. */
  exactFirst?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={labels.open}
        className={cn(
          "text-foreground hover:bg-muted flex size-11 items-center justify-center rounded-lg transition-colors",
          className,
        )}
      >
        <Menu aria-hidden="true" className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="bg-background fixed inset-x-0 top-0 z-50 flex max-h-dvh flex-col gap-2 overflow-y-auto rounded-b-2xl px-5 pt-2.5 pb-6 shadow-(--shadow-raised) transition-transform duration-200 data-[ending-style]:-translate-y-4 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-4 data-[starting-style]:opacity-0">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-heading text-xl">{labels.title}</Dialog.Title>
            <Dialog.Close
              aria-label={labels.close}
              className="text-foreground hover:bg-muted -mr-2.5 flex size-11 items-center justify-center rounded-lg transition-colors"
            >
              <X aria-hidden="true" className="size-6" />
            </Dialog.Close>
          </div>
          <nav aria-label={labels.title} className="flex flex-col">
            {items.map((item, index) => (
              <NavLink
                key={item.href}
                href={item.href}
                exact={exactFirst && index === 0}
                onNavigate={() => setOpen(false)}
                className="border-border text-foreground flex min-h-13 items-center border-b text-lg font-medium no-underline"
              >
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span
                    aria-label={item.badgeLabel}
                    className="bg-highlight text-on-highlight flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.8125rem] font-semibold"
                  >
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          {footer ? (
            // Links and buttons in here close the sheet too.
            <div className="flex flex-col gap-3 pt-4" onClick={() => setOpen(false)}>
              {footer}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
