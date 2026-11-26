import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";

/** Header of the public site. Everything in it is the same for every visitor, so it caches. */
export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const items = [
    { href: routes.courses, label: t("courses") },
    { href: routes.homeSection("howItWorks"), label: t("howItWorks") },
    { href: routes.homeSection("contact"), label: t("contact") },
  ];

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-x-8 gap-y-3 py-2 pr-2.5 pl-5 md:px-6 md:py-3.5">
        <Link
          href={routes.home}
          // Starts with the name on screen, so voice control finds it by what is shown.
          aria-label={`${siteConfig.name}: ${t("home")}`}
          className="text-foreground flex min-h-11 items-center no-underline"
        >
          <Logo className="max-md:[&>span]:text-xl max-md:[&>svg]:size-[30px]" />
        </Link>

        <nav aria-label={t("main")} className="hidden items-center gap-x-7 md:flex">
          {items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              className="text-foreground hover:text-primary flex min-h-11 items-center font-medium no-underline transition-colors"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <LocaleSwitcher />
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
            </>
          }
        />
      </div>
    </header>
  );
}
