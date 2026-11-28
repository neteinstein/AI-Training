import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeScript } from "@/components/layout/theme-script";
import { htmlLang, locales, ogLocale, siteConfig, siteUrl } from "@/config/site";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/inter-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const manrope = localFont({
  src: "../fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
  adjustFontFallback: "Arial",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Metadata");
  const name = siteConfig.name[locale];
  return {
    metadataBase: new URL(siteUrl),
    title: { default: t("title"), template: `%s · ${name}` },
    description: t("description"),
    // Link previews. og:title and og:description come from each page's own title and
    // description, and the X card copies all of it. A page that sets its own `openGraph`
    // replaces all of this, picture included.
    openGraph: {
      type: "website",
      siteName: name,
      locale: ogLocale[locale],
      alternateLocale: locales.filter((other) => other !== locale).map((other) => ogLocale[other]),
      images: [
        {
          url: siteConfig.ogImage.path[locale],
          width: siteConfig.ogImage.width,
          height: siteConfig.ogImage.height,
          type: "image/png",
          alt: name,
        },
      ],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale();
  const t = await getTranslations("Common");

  return (
    <html
      lang={htmlLang[locale]}
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
      // The script below adds data-theme before React starts: that difference is expected.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#content"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-lg px-4 py-3 font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
