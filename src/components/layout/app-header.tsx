import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CurrentUser } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

/**
 * Header of the learner area. On inner pages it shows the way back (to the course list, or
 * to the course) instead of the logo, as on the phone mockups.
 */
export function AppHeader({
  user,
  back,
  className,
}: {
  user: CurrentUser;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className="border-border bg-background border-b">
      <div
        className={cn(
          "mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between gap-2 py-1 pr-2 pl-2 sm:pr-4",
          className,
        )}
      >
        {back ? (
          <Link
            href={back.href}
            className="text-foreground hover:text-primary flex min-h-11 min-w-0 items-center gap-1 pr-2 pl-1 text-[0.9375rem] font-semibold no-underline transition-colors"
          >
            <ChevronLeft aria-hidden="true" className="size-5 flex-none" />
            <span className="truncate">{back.label}</span>
          </Link>
        ) : (
          <Link
            href={routes.learn}
            className="text-foreground flex min-h-11 items-center pl-2 no-underline"
          >
            <Logo size={30} className="[&>span]:text-xl" />
          </Link>
        )}
        <div className="flex flex-none items-center gap-1.5">
          <LocaleSwitcher />
          <UserMenu name={user.fullName} email={user.email} role={user.role} area="learner" />
        </div>
      </div>
    </header>
  );
}
