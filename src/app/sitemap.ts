import type { MetadataRoute } from "next";
import { defaultLocale, locales, siteUrl } from "@/config/site";
import { getCatalog } from "@/lib/dal/catalog";
import { routes } from "@/lib/routes";

/** Every public page, in both languages, each pointing at its translation. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { courses } = await getCatalog(defaultLocale);
  const paths = [
    routes.home,
    routes.courses,
    ...courses.map((course) => routes.course(course.slug)),
    routes.privacy,
  ];
  const address = (locale: string, path: string) =>
    `${siteUrl}/${locale}${path === "/" ? "" : path}`;

  return paths.flatMap((path) =>
    locales.map((locale) => ({
      url: address(locale, path),
      alternates: {
        languages: Object.fromEntries(locales.map((other) => [other, address(other, path)])),
      },
    })),
  );
}
