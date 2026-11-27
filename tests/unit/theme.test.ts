import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DARK_QUERY,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeScript,
  toThemeChoice,
} from "@/lib/theme";

/** Runs the script of <head> as a browser would, and says which theme it put on <html>. */
function runScript(options: { stored: string | null; deviceIsDark: boolean }) {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  if (options.stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, options.stored);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DARK_QUERY && options.deviceIsDark,
  }));
  new Function(themeScript)();
  return document.documentElement.getAttribute("data-theme");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("the theme", () => {
  test("a choice wins over the device; without one the device decides", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });

  test("anything other than a stored choice means: follow the device", () => {
    expect(toThemeChoice("light")).toBe("light");
    expect(toThemeChoice("dark")).toBe("dark");
    for (const stored of [null, undefined, "", "auto", "DARK", "blue"]) {
      expect(toThemeChoice(stored)).toBe("auto");
    }
  });

  const stored = [null, "light", "dark", "auto", "blue"];
  const cases = stored.flatMap((value) => [
    { stored: value, deviceIsDark: false },
    { stored: value, deviceIsDark: true },
  ]);

  test.each(cases)(
    "the script of <head> decides as the functions do (stored: $stored, dark device: $deviceIsDark)",
    (options) => {
      expect(runScript(options)).toBe(
        resolveTheme(toThemeChoice(options.stored), options.deviceIsDark),
      );
    },
  );

  test("when the browser refuses storage, the script still follows the device", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    expect(runScript({ stored: null, deviceIsDark: true })).toBe("dark");
    expect(runScript({ stored: null, deviceIsDark: false })).toBe("light");
  });

  test("a browser that cannot tell what the device asks for gets the light theme", () => {
    document.documentElement.removeAttribute("data-theme");
    vi.stubGlobal("matchMedia", undefined);
    new Function(themeScript)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("the script stands alone: no imports, no line breaks, nothing a page could break", () => {
    expect(themeScript).not.toMatch(/import|require|\n/);
    expect(themeScript).not.toContain("</");
  });
});
