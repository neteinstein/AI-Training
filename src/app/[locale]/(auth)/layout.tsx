import type { Metadata } from "next";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Logo } from "@/components/layout/logo";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

// Sign-in screens are not for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-5">
          <Link
            href={routes.home}
            className="text-foreground flex min-h-11 items-center no-underline"
          >
            <Logo size={30} className="[&>span]:text-xl" />
          </Link>
          <span className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeSwitch />
          </span>
        </div>
      </header>
      <main
        id="content"
        className="mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-5 pt-8 pb-6 sm:pt-14"
      >
        {children}
      </main>
    </div>
  );
}
