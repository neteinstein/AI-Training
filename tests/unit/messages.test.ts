import { describe, expect, test } from "vitest";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result[path] = value;
    else Object.assign(result, flatten(value, path));
  }
  return result;
}

/** Names of the placeholders in an ICU message, e.g. "{count, plural, ...}" -> count. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*(?:[,}])/g)) names.add(match[1]);
  return [...names].sort();
}

const portuguese = flatten(pt);
const english = flatten(en);

describe("translations", () => {
  test("both languages define exactly the same messages", () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(portuguese).sort());
  });

  test("no message is empty", () => {
    const empty = [...Object.entries(portuguese), ...Object.entries(english)]
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  test("each message uses the same placeholders in both languages", () => {
    const mismatched = Object.keys(portuguese).filter(
      (key) =>
        key in english &&
        placeholders(portuguese[key]).join() !== placeholders(english[key]).join(),
    );
    expect(mismatched).toEqual([]);
  });
});
