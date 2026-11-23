import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@/config/site";

// Every URL carries its language: /pt/... and /en/...
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
