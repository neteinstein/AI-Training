import { siteUrl, type Locale } from "@/config/site";
import { routes } from "@/lib/routes";

export type EmailLinkType = "invite" | "recovery";

/**
 * Address of the click-to-confirm page for a one-time token. Emails build the same address in
 * supabase/templates; this is for links a trainer copies and sends by hand.
 */
export function confirmUrl(locale: Locale, tokenHash: string, type: EmailLinkType): string {
  const url = new URL(`/${locale}${routes.authConfirm}`, siteUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}
