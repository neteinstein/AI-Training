import { classifyPath } from "./route-access";

const MAX_LENGTH = 512;
const BASE = "http://internal.invalid";

/**
 * Validates a "where to go after signing in" value taken from the URL.
 * Returns an internal path without a language prefix, or the fallback. Only the signed-in
 * areas are accepted, so the value can never send someone to another site.
 */
export function safeNextPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  // Must be a single-slash absolute path: no scheme, no "//host", no backslash tricks.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  const { path, access } = classifyPath(url.pathname);
  if (access !== "protected") return fallback;

  return `${path}${url.search}`;
}
