"use client";

import { Popover } from "@base-ui/react/popover";
import { CircleUserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

const itemClass =
  "text-foreground hover:bg-muted flex min-h-11 items-center rounded-lg px-3 font-medium no-underline transition-colors";

/** The account button of the signed-in areas: who is signed in, their pages, and sign out. */
export function UserMenu({
  name,
  email,
  role,
  area,
}: {
  name: string;
  email: string;
  role: "learner" | "trainer";
  /** Which area the menu is shown in, so it can offer the way to the other one. */
  area: "learner" | "trainer";
}) {
  const t = useTranslations("Account");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={t("menu")}
        className="text-foreground hover:bg-muted data-[popup-open]:bg-muted flex size-11 flex-none items-center justify-center rounded-lg transition-colors"
      >
        <CircleUserRound aria-hidden="true" className="size-6" strokeWidth={1.75} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="border-border bg-card flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border p-2 shadow-(--shadow-raised)">
            <div className="border-border mb-1 flex flex-col border-b px-3 pt-2 pb-3">
              <Popover.Title className="text-muted-foreground text-[0.8125rem]">
                {t("signedInAs")}
              </Popover.Title>
              {name ? <span className="font-semibold break-words">{name}</span> : null}
              <span className="text-muted-foreground text-sm break-all">{email}</span>
            </div>
            {role === "trainer" ? (
              <Link
                href={area === "trainer" ? routes.learn : routes.trainer}
                onClick={close}
                className={itemClass}
              >
                {area === "trainer" ? t("learnerArea") : t("backOffice")}
              </Link>
            ) : null}
            <Link href={routes.account} onClick={close} className={itemClass}>
              {t("title")}
            </Link>
            <SignOutButton className="[&>button]:w-full [&>button]:justify-start [&>button]:px-3" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
