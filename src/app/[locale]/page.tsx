import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Logo } from "@/components/layout/logo";

// Placeholder home page: replaced by the landing page once the design is approved.
export default async function HomePage() {
  const t = await getTranslations("Metadata");

  return (
    <main id="content" className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1>
        <Logo size={48} className="[&>span]:text-4xl" />
      </h1>
      <p className="text-muted-foreground max-w-md text-center text-lg">{t("description")}</p>
      <LocaleSwitcher />
    </main>
  );
}
