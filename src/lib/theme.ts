/**
 * Light and dark.
 *
 * A person can choose a theme; the choice is kept on their device. Without one the site
 * follows the device. Either way `<html data-theme>` says which theme is showing, and the
 * colours in src/app/globals.css follow that attribute.
 */

/** Where the choice is kept. "Automatic" is kept as nothing at all. */
export const THEME_STORAGE_KEY = "theme";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const themeChoices = ["light", "dark", "auto"] as const;
export type ThemeChoice = (typeof themeChoices)[number];
export type Theme = "light" | "dark";

/** The choice a stored value stands for. Anything unexpected means "follow the device". */
export function toThemeChoice(stored: string | null | undefined): ThemeChoice {
  return stored === "light" || stored === "dark" ? stored : "auto";
}

/** The theme to show for a choice, given what the device asks for. */
export function resolveTheme(choice: ThemeChoice, deviceIsDark: boolean): Theme {
  if (choice === "auto") return deviceIsDark ? "dark" : "light";
  return choice;
}

/**
 * Runs in `<head>`, before anything is drawn, so a page never appears first in the wrong
 * theme. It has to stand alone, and must decide exactly as the two functions above do: a
 * unit test runs it against them.
 */
export const themeScript = `(function(){var c=null;try{c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var d=c==="dark"||(c!=="light"&&!!window.matchMedia&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")})()`;
