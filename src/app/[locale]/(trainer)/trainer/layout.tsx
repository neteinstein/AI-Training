import type { Metadata } from "next";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Logo } from "@/components/layout/logo";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Placeholder chrome for the back-office; the sidebar layout comes with the back-office screens.
export default function TrainerLayout({ children }: LayoutProps<"/[locale]/trainer">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
          <Link
            href={routes.trainer}
            className="text-foreground flex min-h-11 items-center no-underline"
          >
            <Logo size={30} className="[&>span]:text-xl" />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
