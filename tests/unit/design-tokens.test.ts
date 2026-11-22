import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { areaColors } from "@/config/site";

/** Hex colour tokens declared in the :root block of the theme file. */
function readTokens(): Record<string, string> {
  const css = readFileSync("src/app/globals.css", "utf8");
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const tokens: Record<string, string> = {};
  for (const match of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const tokens = readTokens();
const WHITE = "#ffffff";

// [text, background] pairs used for body-size text. WCAG 2.2 AA asks for 4.5:1.
const textPairs: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "muted"],
  ["foreground", "accent"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary", "card"],
  ["primary", "muted"],
  ["accent-foreground", "accent"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["highlight", "background"],
  ["highlight", "card"],
  ["highlight-foreground", "background"],
  ["highlight-foreground", "highlight-tint"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
];

describe("design tokens", () => {
  test("the theme file declares every token the checks rely on", () => {
    const needed = new Set(textPairs.flat());
    const missing = [...needed].filter((name) => !(name in tokens));
    expect(missing).toEqual([]);
  });

  test.each(textPairs)("%s on %s is readable (4.5:1 or better)", (text, background) => {
    expect(contrast(tokens[text], tokens[background])).toBeGreaterThanOrEqual(4.5);
  });

  test("white text is readable on the solid brand and error colours", () => {
    for (const name of ["primary", "primary-hover", "highlight", "destructive"]) {
      expect(contrast(WHITE, tokens[name]), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  test.each(areaColors)("area colour %s is readable on its tint and on white", (name) => {
    const tone = tokens[`area-${name}`];
    const tint = tokens[`area-${name}-tint`];
    expect(tone, `--area-${name}`).toBeDefined();
    expect(tint, `--area-${name}-tint`).toBeDefined();
    expect(contrast(tone, tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tone, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  test("form-field outlines and the focus ring stand out from the page (3:1 or better)", () => {
    for (const surface of ["background", "card", "muted"]) {
      expect(contrast(tokens.input, tokens[surface]), `input on ${surface}`).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrast(tokens.ring, tokens[surface]), `ring on ${surface}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });
});
