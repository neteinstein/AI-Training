import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * The shape every back-office page shares: a bar with where you are, the language switch and
 * (on wide screens) the theme switch, then the page's heading, then its content.
 */
export async function PageFrame({
  crumbs,
  barActions,
  title,
  meta,
  headerAside,
  tabs,
  narrow = false,
  children,
}: {
  crumbs: Crumb[];
  /** Links shown in the top bar, before the language switch. */
  barActions?: ReactNode;
  title: ReactNode;
  /** A line under the title: chips, counts, a short explanation. */
  meta?: ReactNode;
  /** Beside the title: the page's main action, or a status control. */
  headerAside?: ReactNode;
  tabs?: ReactNode;
  /** Forms read better in a narrower column than lists. */
  narrow?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations("Trainer");

  return (
    <>
      <div className="border-border flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b px-5 py-2 md:px-8">
        <nav aria-label={t("breadcrumb")} className="min-w-0">
          <ol className="text-muted-foreground flex list-none flex-wrap items-center gap-x-2 text-sm">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex min-h-11 items-center gap-2">
                {index > 0 ? <ChevronRight aria-hidden="true" className="size-3.5" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground font-semibold">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {barActions}
          <span className="flex items-center gap-1">
            <LocaleSwitcher />
            {/* On a phone the bar has no room to spare: there the choice is in the menu. */}
            <ThemeSwitch className="max-md:hidden" />
          </span>
        </div>
      </div>

      <main id="content" className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 pt-6 md:px-8">
          <div className="flex min-w-0 flex-col gap-2.5">
            <h1 className="font-heading text-[1.875rem] leading-[1.2] break-words">{title}</h1>
            {meta}
          </div>
          {headerAside}
        </div>
        {tabs}
        <div
          className={cn(
            "flex flex-1 flex-col gap-4 px-5 pt-6 pb-10 md:px-8",
            narrow && "max-w-4xl",
          )}
        >
          {children}
        </div>
      </main>
    </>
  );
}

/** Tabs that are links: each one is a page of its own. */
export function TabLinks({
  label,
  tabs,
}: {
  label: string;
  tabs: Array<{ href: string; label: string; current: boolean }>;
}) {
  return (
    <nav
      aria-label={label}
      className="border-border mt-4 flex flex-wrap gap-x-7 border-b px-5 md:px-8"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "flex min-h-12 items-center border-b-[3px] font-semibold no-underline transition-colors",
            tab.current
              ? "border-primary text-primary"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
