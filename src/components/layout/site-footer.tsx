import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { Logo } from "./logo";
import { OtherLanguageLink } from "./other-language-link";

const linkClass =
  "flex min-h-11 items-center text-footer-foreground no-underline hover:underline underline-offset-4";

export async function SiteFooter() {
  const t = await getTranslations("Nav");
  return (
    <footer className="bg-footer text-footer-foreground">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-x-10 gap-y-5 px-5 py-8 md:px-6 md:py-11">
        <div className="flex flex-col gap-1">
          <Logo inverted size={30} className="[&>span]:text-xl" />
          <p className="text-footer-foreground/75 text-sm">
            {t.rich("poweredBy", {
              link: (chunks) => (
                <a
                  href={siteConfig.operator.url}
                  className="text-footer-foreground font-semibold underline-offset-4 hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
        <nav aria-label={t("footer")} className="flex flex-wrap items-center gap-x-7 gap-y-1">
          <Link href={routes.privacy} className={linkClass}>
            {t("privacy")}
          </Link>
          <Link href={routes.homeSection("contact")} className={linkClass}>
            {t("contact")}
          </Link>
          <Link href={routes.login} className={linkClass}>
            {t("memberArea")}
          </Link>
          <OtherLanguageLink className="text-footer-foreground flex min-h-11 items-center underline underline-offset-4" />
        </nav>
      </div>
    </footer>
  );
}
