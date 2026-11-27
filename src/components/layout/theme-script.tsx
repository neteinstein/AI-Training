"use client";

import { themeScript } from "@/lib/theme";

/**
 * Sets light or dark on <html> before anything is drawn (see src/lib/theme.ts).
 *
 * The browser runs the script while it reads the page it was sent. When React later builds
 * the same element in the browser it must not look like a script again: scripts created that
 * way never run, and React says so. Hence the type that differs between the two, as the
 * framework's guide on avoiding a flash before hydration prescribes.
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeScript }}
    />
  );
}
