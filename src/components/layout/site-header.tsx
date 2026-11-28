import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";
import { ThemeSwitch } from "./theme-switch";

/** Header of the public site. Everything in it is the same for every visitor, so it caches. */
export async function SiteHeader() {
  const locale = await getLocale();
  const t = await getTranslations("Nav");
  const items = [
    { href: routes.courses, label: t("courses") },
    { href: routes.homeSection("howItWorks"), label: t("howItWorks") },
    // Only from lg up in the bar: a fourth link makes it wrap on tablets. Always in the phone menu.
    { href: routes.homeSection("faq"), label: t("faq"), wideOnly: true },
    { href: routes.homeSection("contact"), label: t("contact") },
  ];

  return (
    <header className="border-border border-b">
      {/* Between a phone and a laptop the bar holds everything on one line only just: the
          logo stays small and the gaps tight until there is room (lg). */}
      <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-x-5 gap-y-3 py-2 pr-2.5 pl-5 md:px-6 md:py-3.5 lg:gap-x-8">
        <Link
          href={routes.home}
          // Starts with the name on screen, so voice control finds it by what is shown.
          aria-label={`${siteConfig.name[locale]}: ${t("home")}`}
          className="text-foreground flex min-h-11 items-center no-underline"
        >
          <Logo className="max-lg:[&>span]:text-xl max-lg:[&>svg]:size-[30px]" />
        </Link>

        <nav aria-label={t("main")} className="hidden items-center gap-x-5 md:flex lg:gap-x-7">
          {items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              className={cn(
                "text-foreground hover:text-primary flex min-h-11 items-center font-medium whitespace-nowrap no-underline transition-colors",
                item.wideOnly && "hidden lg:flex",
              )}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex lg:gap-4">
          <span className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeSwitch />
          </span>
          <Link href={routes.login} className={buttonClass({ variant: "outline", size: "sm" })}>
            {t("signIn")}
          </Link>
        </div>

        <MobileMenu
          className="md:hidden"
          items={items}
          labels={{ open: t("openMenu"), close: t("closeMenu"), title: t("menu") }}
          footer={
            <>
              <Link href={routes.login} className={buttonClass({ variant: "outline" })}>
                {t("signIn")}
              </Link>
              <LocaleSwitcher className="self-start" />
              <ThemeSwitch inline className="self-start" />
            </>
          }
        />
      </div>
    </header>
  );
}
