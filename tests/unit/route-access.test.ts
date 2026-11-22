import { describe, expect, test } from "vitest";
import { classifyPath } from "@/lib/security/route-access";
import { safeNextPath } from "@/lib/security/safe-next";

describe("classifyPath", () => {
  test.each([
    ["/pt", { locale: "pt", path: "/", access: "public" }],
    [
      "/en/courses/ai-in-the-classroom",
      { locale: "en", path: "/courses/ai-in-the-classroom", access: "public" },
    ],
    ["/pt/learn", { locale: "pt", path: "/learn", access: "protected" }],
    ["/pt/learn/", { locale: "pt", path: "/learn", access: "protected" }],
    [
      "/en/learn/courses/x/materials/y",
      { locale: "en", path: "/learn/courses/x/materials/y", access: "protected" },
    ],
    ["/pt/trainer/users", { locale: "pt", path: "/trainer/users", access: "protected" }],
    ["/pt/login", { locale: "pt", path: "/login", access: "guest-only" }],
    ["/en/forgot-password", { locale: "en", path: "/forgot-password", access: "guest-only" }],
    ["/pt/auth/confirm", { locale: "pt", path: "/auth/confirm", access: "public" }],
    // Look-alike prefixes are not protected areas.
    ["/pt/learning", { locale: "pt", path: "/learning", access: "public" }],
    ["/pt/trainers", { locale: "pt", path: "/trainers", access: "public" }],
  ])("%s", (pathname, expected) => {
    expect(classifyPath(pathname)).toEqual(expected);
  });

  test("a path without a known language prefix has no locale", () => {
    expect(classifyPath("/learn")).toEqual({ locale: null, path: "/learn", access: "protected" });
    expect(classifyPath("/fr/learn").locale).toBeNull();
    expect(classifyPath("/").locale).toBeNull();
  });
});

describe("safeNextPath", () => {
  const fallback = "/learn";

  test.each([
    ["/learn", "/learn"],
    ["/learn/courses/ai-in-the-classroom", "/learn/courses/ai-in-the-classroom"],
    ["/trainer/courses?status=draft", "/trainer/courses?status=draft"],
    // A language prefix is dropped: the caller adds the user's own language.
    ["/en/learn/account", "/learn/account"],
  ])("accepts %s", (input, expected) => {
    expect(safeNextPath(input, fallback)).toBe(expected);
  });

  test.each([
    ["another site", "https://evil.example/learn"],
    ["protocol-relative address", "//evil.example/learn"],
    ["backslash trick", "/\\evil.example/learn"],
    ["scheme without slashes", "javascript:alert(1)"],
    ["public page", "/courses"],
    ["login page (redirect loop)", "/login"],
    ["path that climbs out of the area", "/learn/../../login"],
    ["control characters", "/learn\n/x"],
    ["relative path", "learn"],
    ["empty string", ""],
    ["over-long value", `/learn/${"a".repeat(600)}`],
    ["non-string value", ["/learn"]],
    ["missing value", undefined],
  ])("rejects %s", (_label, input) => {
    expect(safeNextPath(input, fallback)).toBe(fallback);
  });
});
