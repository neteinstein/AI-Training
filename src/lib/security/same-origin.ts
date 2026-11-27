/**
 * Whether a form post comes from a page of this site, by the same test Next.js applies to
 * Server Actions: the browser's `Origin` header must name the host the request was sent to.
 *
 * The session cookies are already `SameSite=Lax`, so a form on another site arrives without
 * them; this is the second lock. A request with no `Origin` at all (not something a browser
 * sends with a form post) is let through, as Next.js does, and then still needs the cookies.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return true;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  try {
    return host !== "" && new URL(origin).host === host;
  } catch {
    // "null" (a sandboxed frame, a privacy setting) or anything else that is not an address.
    return false;
  }
}
