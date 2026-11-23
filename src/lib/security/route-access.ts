import { locales, type Locale } from "@/config/site";

export type RouteAccess = "public" | "protected" | "guest-only";

export type ClassifiedPath = {
  /** Language prefix of the URL, or null when it has none (or an unknown one). */
  locale: Locale | null;
  /** The path after the language prefix, always starting with "/". */
  path: string;
  access: RouteAccess;
};

const PROTECTED_PREFIXES = ["/learn", "/trainer"];
const GUEST_ONLY_PATHS = ["/login", "/forgot-password"];

const matchesPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

/**
 * Coarse classification used by the proxy to decide on redirects.
 * It is a convenience, not the security boundary: pages, Server Actions and the database
 * each check access again.
 */
export function classifyPath(pathname: string): ClassifiedPath {
  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  const locale = (locales as readonly string[]).includes(first) ? (first as Locale) : null;

  let path = locale ? `/${segments.slice(2).join("/")}` : pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  let access: RouteAccess = "public";
  if (PROTECTED_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) access = "protected";
  else if (GUEST_ONLY_PATHS.includes(path)) access = "guest-only";

  return { locale, path, access };
}
