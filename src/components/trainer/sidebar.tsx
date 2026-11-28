import {
  BookOpen,
  DatabaseBackup,
  Inbox,
  Layers,
  LayoutDashboard,
  MessagesSquare,
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
import { countConversationsToAnswer } from "@/lib/dal/conversation-queries";
import { requireTrainer } from "@/lib/dal/session";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** The menu's width on wide screens, shared with the placeholder shown while it loads. */
const MENU_WIDTH = "w-62";

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
  // What is waiting: requests from the public form, and learners' messages that fall to this
  // trainer (those of the courses they teach, and of courses nobody teaches yet).
  const [{ count }, toAnswer] = await Promise.all([
    supabase.from("info_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    countConversationsToAnswer(supabase, user.id),
  ]);
  const newRequests = count ?? 0;

  const items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
    /** What the number counts, for assistive technology. */
    badgeLabel?: string;
  }> = [
    { href: routes.trainer, label: t("dashboard"), icon: LayoutDashboard },
    { href: routes.trainerCourses, label: t("courses"), icon: BookOpen },
    { href: routes.trainerAreas, label: t("areas"), icon: Layers },
    { href: routes.trainerLevels, label: t("levels"), icon: Signal },
    { href: routes.trainerUsers, label: t("users"), icon: Users },
    {
      href: routes.trainerConversations,
      label: t("conversations"),
      icon: MessagesSquare,
      badge: toAnswer,
      badgeLabel: toAnswer > 0 ? t("toAnswer", { count: toAnswer }) : undefined,
    },
    {
      href: routes.trainerRequests,
      label: t("requests"),
      icon: Inbox,
      badge: newRequests,
      badgeLabel: newRequests > 0 ? t("newRequests", { count: newRequests }) : undefined,
    },
    { href: routes.trainerBackup, label: t("backup"), icon: DatabaseBackup },
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
          items={items.map(({ href, label, badge, badgeLabel }) => ({
            href,
            label,
            badge,
            badgeLabel,
          }))}
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

      {/*
        Wide screens. The width leaves 159px for an entry's text: the longest one, "Cópia de
        segurança", needs 154px when it is the current page and bold, and has to stay on one
        line. A browser test measures the entries in both languages.
      */}
      <aside
        aria-label={t("label")}
        className={cn(
          MENU_WIDTH,
          "border-border bg-muted hidden flex-none flex-col gap-6 border-r px-4 py-5 md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto",
        )}
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
                  aria-label={item.badgeLabel}
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
      <div
        className={cn(
          MENU_WIDTH,
          "border-border bg-muted hidden flex-none border-r md:block md:h-dvh",
        )}
      />
    </>
  );
}
