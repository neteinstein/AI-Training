import { createServerClient, type CookieOptions } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { classifyPath } from "@/lib/security/route-access";

const handleI18nRouting = createIntlMiddleware(routing);

/**
 * Runs before every page request:
 *   1. refreshes the Supabase session cookie when there is one;
 *   2. applies language routing (/ -> /pt, unknown prefix -> default language);
 *   3. redirects signed-out visitors away from the signed-in areas, and signed-in users away
 *      from the login pages.
 *
 * Step 3 is a convenience. Pages, Server Actions and the database each check access again.
 */
export default async function proxy(request: NextRequest) {
  const refreshedCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const cacheHeaders: Record<string, string> = {};
  let signedIn = false;

  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));

  if (hasAuthCookie) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet, headers) {
            for (const cookie of cookiesToSet) {
              // Make the refreshed session visible to the rest of this request...
              request.cookies.set(cookie.name, cookie.value);
              // ...and remember it for the response.
              refreshedCookies.push(cookie);
            }
            Object.assign(cacheHeaders, headers);
          },
        },
      },
    );
    // Verifies the token and refreshes it when it has expired. Nothing may run between
    // creating the client and this call.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  }

  const i18nResponse = handleI18nRouting(request);
  let response = i18nResponse;

  const isNavigation = request.method === "GET" || request.method === "HEAD";
  if (isNavigation && !i18nResponse.headers.has("location")) {
    const { locale, path, access } = classifyPath(request.nextUrl.pathname);

    if (locale && access === "protected" && !signedIn) {
      const login = new URL(`/${locale}${routes.login}`, request.url);
      login.searchParams.set("next", `${path}${request.nextUrl.search}`);
      response = NextResponse.redirect(login);
    } else if (locale && access === "guest-only" && signedIn) {
      response = NextResponse.redirect(new URL(`/${locale}${routes.learn}`, request.url));
    }

    if (response !== i18nResponse) {
      // Keep whatever the language routing wanted to set (the language cookie).
      for (const cookie of i18nResponse.cookies.getAll()) response.cookies.set(cookie);
    } else if (access !== "public") {
      // No alternate-language links for pages search engines should not index.
      response.headers.delete("link");
    }
  }

  for (const { name, value, options } of refreshedCookies) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(cacheHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension.
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
