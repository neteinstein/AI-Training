import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Logo } from "@/components/layout/logo";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

// Rendered for unknown paths (via [...rest]/page.tsx) and whenever a page calls notFound().
export default async function NotFoundPage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <Link href={routes.home} className="text-foreground no-underline">
          <Logo />
        </Link>
        <LocaleSwitcher />
      </header>
      <main
        id="content"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-5 px-5 py-16"
      >
        <p className="text-highlight-foreground font-semibold">404</p>
        <h1 className="font-heading text-4xl leading-tight">{t("NotFound.title")}</h1>
        <p className="text-muted-foreground text-lg">{t("NotFound.description")}</p>
        <Link href={routes.home} className={buttonClass()}>
          {t("Common.backToHome")}
        </Link>
      </main>
    </div>
  );
}
