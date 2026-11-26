import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(__dirname, "..", "..", "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * Whatever a Client Component imports is shipped to the browser. The validation library is
 * large and probes for `eval`, which the Content Security Policy blocks and reports, so the
 * schemas stay on the server: forms take the few constants they need from a `constants` file.
 */
describe("browser bundle", () => {
  const clientFiles = sourceFiles(root).filter((file) =>
    /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
  );

  test("there are Client Components to check", () => {
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  test("no Client Component imports the validation library or a schemas file", () => {
    const offenders = clientFiles.filter((file) =>
      /from\s+["'](zod|[^"']*\/schemas)["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  /**
   * A Server Component that imports a plain value from a "use client" file does not get the
   * value: it gets a reference to it, which renders as nothing. (That is how a set of class
   * names once reached the page as `undefined`.) So client files export components, hooks and
   * types only; shared constants live in a plain module.
   */
  test("no Client Component file exports plain data", () => {
    const dataExport = /^export const [a-z]\w*(?:\s*:[^=\n]+)?\s*=\s*(?:[{["'`\d]|true\b|false\b)/m;
    const offenders = clientFiles.filter((file) => dataExport.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  test("constants files stay free of the validation library", () => {
    const constants = sourceFiles(root).filter((file) => file.endsWith("constants.ts"));
    expect(constants.length).toBeGreaterThanOrEqual(2);
    for (const file of constants) {
      expect(readFileSync(file, "utf8"), relative(root, file)).not.toMatch(/from\s+["']zod["']/);
    }
  });
});
