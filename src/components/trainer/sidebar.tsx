import {
  BookOpen,
  Inbox,
  Layers,
  LayoutDashboard,
  Signal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Logo } from "@/components/layout/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { NavLink } from "@/components/layout/nav-link";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { Link } from "@/i18n/navigation";
import { requireTrainer } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The back-office menu: a column beside the page on wide screens, a bar with a menu button on
 * phones. It reads who is signed in, so it renders at request time inside its own boundary.
 */
export async function Sidebar() {
  const locale = await getLocale();
  const user = await requireTrainer(locale);
  const t = await getTranslations("Trainer.nav");
  const tMenu = await getTranslations("Nav");
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("info_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  const newRequests = count ?? 0;
  const badgeLabel = newRequests > 0 ? t("newRequests", { count: newRequests }) : undefined;

  const items: Array<{ href: string; label: string; icon: LucideIcon; badge?: number }> = [
    { href: routes.trainer, label: t("dashboard"), icon: LayoutDashboard },
    { href: routes.trainerCourses, label: t("courses"), icon: BookOpen },
    { href: routes.trainerAreas, label: t("areas"), icon: Layers },
    { href: routes.trainerLevels, label: t("levels"), icon: Signal },
    { href: routes.trainerUsers, label: t("users"), icon: Users },
    { href: routes.trainerRequests, label: t("requests"), icon: Inbox, badge: newRequests },
  ];

  const account = (
    <>
      <Link
        href={routes.account}
        className="text-primary hover:text-primary-hover inline-flex min-h-11 items-center px-3 font-semibold no-underline"
      >
        {t("account")}
      </Link>
      <SignOutButton className="[&>button]:justify-start [&>button]:px-3" />
    </>
  );

  return (
    <>
      {/* Phones and narrow windows */}
      <header className="border-border bg-muted flex min-h-14 items-center justify-between border-b py-1 pr-2 pl-4 md:hidden">
        <Link
          href={routes.trainer}
          className="text-foreground flex min-h-11 items-center no-underline"
        >
          <Logo size={30} className="[&>span]:text-xl" />
        </Link>
        <MobileMenu
          items={items.map(({ href, label, badge }) => ({ href, label, badge, badgeLabel }))}
          labels={{ open: tMenu("openMenu"), close: tMenu("closeMenu"), title: tMenu("menu") }}
          exactFirst
          footer={
            <>
              <p className="flex flex-col px-3">
                <span className="font-semibold break-words">{user.fullName || user.email}</span>
                <span className="text-muted-foreground text-[0.8125rem]">{t("role")}</span>
              </p>
              {account}
              <LocaleSwitcher className="mx-3 self-start" />
              <ThemeSwitch inline className="mx-3 self-start" />
            </>
          }
        />
      </header>

      {/* Wide screens */}
      <aside
        aria-label={t("label")}
        className="border-border bg-muted hidden w-58 flex-none flex-col gap-6 border-r px-4 py-5 md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto"
      >
        <Link
          href={routes.trainer}
          className="text-foreground flex min-h-11 items-center px-2 no-underline"
        >
          <Logo size={30} className="[&>span]:text-xl" />
        </Link>
        <nav aria-label={t("label")} className="flex flex-col gap-1">
          {items.map((item, index) => (
            <NavLink
              key={item.href}
              href={item.href}
              exact={index === 0}
              className="text-foreground hover:bg-card/70 flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium no-underline transition-colors"
              activeClassName="bg-card text-primary font-semibold shadow-[0_0_0_1px_var(--border)]"
            >
              <item.icon aria-hidden="true" className="size-5 flex-none" strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span
                  aria-label={badgeLabel}
                  className="bg-highlight text-on-highlight flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.8125rem] font-semibold"
                >
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-border mt-auto flex flex-col gap-0.5 border-t pt-3">
          <p className="flex flex-col px-3 pb-1">
            <span className="font-semibold break-words">{user.fullName || user.email}</span>
            <span className="text-muted-foreground text-[0.8125rem]">{t("role")}</span>
          </p>
          {account}
        </div>
      </aside>
    </>
  );
}

/** Holds the menu's place while it loads, so the page does not jump sideways. */
export function SidebarPlaceholder() {
  return (
    <>
      <div className="border-border bg-muted min-h-14 border-b md:hidden" />
      <div className="border-border bg-muted hidden w-58 flex-none border-r md:block md:h-dvh" />
    </>
  );
}
