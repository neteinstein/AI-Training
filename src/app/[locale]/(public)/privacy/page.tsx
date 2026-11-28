import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { container } from "@/components/layout/container";
import { siteConfig } from "@/config/site";
import { routes } from "@/lib/routes";
import { localizedAlternates } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Privacy");
  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates(routes.privacy, locale),
  };
}

/** The sections of the notice, in order. Their text lives in messages/*.json under "Privacy". */
const sections = [
  "controller",
  "data",
  "purpose",
  "cookies",
  "thirdParties",
  "storage",
  "retention",
  "rights",
] as const;

const inlineLink = "text-primary hover:text-primary-hover underline";

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getTranslations("Privacy");

  return (
    <div className={cn(container, "flex flex-col gap-8 pt-8 pb-16 md:pt-14 md:pb-24")}>
      <h1 className="font-heading text-[clamp(2.125rem,3.6vw,3rem)] leading-[1.1]">{t("title")}</h1>
      <div className="flex max-w-[68ch] flex-col gap-8 text-[1.0625rem] leading-[1.65]">
        {sections.map((section) => (
          <section key={section} className="flex flex-col gap-2.5">
            <h2 className="font-heading text-[1.625rem] leading-[1.3]">
              {t(`sections.${section}.title`)}
            </h2>
            <p>
              {t.rich(`sections.${section}.text`, {
                name: siteConfig.name[locale],
                link: (chunks) => (
                  <a href={siteConfig.operator.url} className={inlineLink}>
                    {chunks}
                  </a>
                ),
                email: (chunks) => (
                  <a href={`mailto:${siteConfig.operator.privacyEmail}`} className={inlineLink}>
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
