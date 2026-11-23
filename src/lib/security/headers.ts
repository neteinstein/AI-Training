/**
 * Security headers sent with every response (wired up in next.config.ts).
 *
 * This file must not import anything: next.config.ts loads it before the app is built.
 */

export type HeaderOptions = {
  /** Origin of the Supabase project, e.g. https://abcd.supabase.co. */
  supabaseUrl: string;
  /** Public origin of the app. Decides whether HTTPS-only rules are sent. */
  siteUrl: string;
  /** Hosts the app may show in a frame (videos, Google documents). */
  frameOrigins: readonly string[];
  isDevelopment: boolean;
};

function origin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The Content Security Policy.
 *
 * Scripts and styles may be inline because the public pages are prerendered and cached, which
 * rules out a per-request nonce. Everything else is closed down: scripts only from this site,
 * frames only from the video and Google hosts, connections only to this site and Supabase,
 * and the site itself can never be framed by another one.
 */
export function contentSecurityPolicy(options: HeaderOptions): string {
  const supabase = origin(options.supabaseUrl);
  const realtime = supabase?.replace(/^http/, "ws");
  const https = options.siteUrl.startsWith("https://");
  const list = (...values: Array<string | null | undefined | false>) =>
    values.filter(Boolean).join(" ");

  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' only for the development overlay.
    list("script-src 'self' 'unsafe-inline'", options.isDevelopment && "'unsafe-eval'"),
    "style-src 'self' 'unsafe-inline'",
    // Uploaded images are shown from short-lived Supabase addresses.
    list("img-src 'self' data: blob:", supabase),
    "font-src 'self'",
    // Sign-in, uploads and the PDF viewer talk to Supabase from the browser.
    list("connect-src 'self'", supabase, realtime, options.isDevelopment && "ws: wss:"),
    list("media-src 'self' blob:", supabase),
    list("frame-src", ...options.frameOrigins),
    // The PDF viewer runs its parser in a worker.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    https && "upgrade-insecure-requests",
  ];
  return directives.filter(Boolean).join("; ");
}

export function securityHeaders(options: HeaderOptions): Array<{ key: string; value: string }> {
  const https = options.siteUrl.startsWith("https://");
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // For browsers that do not read frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // The platform uses none of these; full screen stays available for videos and slides.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];
  if (https) {
    // One year. Subdomains are left alone: the domain may host other things.
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  }
  return headers;
}
