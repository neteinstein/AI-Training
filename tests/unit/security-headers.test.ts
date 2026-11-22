import { describe, expect, test } from "vitest";
import { EMBED_FRAME_ORIGINS } from "@/lib/embeds/parse";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

const production = {
  supabaseUrl: "https://abcd.supabase.co",
  siteUrl: "https://cursos.example.org",
  frameOrigins: EMBED_FRAME_ORIGINS,
  isDevelopment: false,
};
const local = {
  ...production,
  supabaseUrl: "http://127.0.0.1:54321",
  siteUrl: "http://localhost:3000",
};

/** The policy as a map: directive name -> its sources. */
function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

describe("content security policy", () => {
  const policy = directives(contentSecurityPolicy(production));

  test("scripts come from this site only and are never evaluated from text", () => {
    expect(policy["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
  });

  test("frames are limited to the video and Google hosts the parser can produce", () => {
    expect(policy["frame-src"]).toEqual([...EMBED_FRAME_ORIGINS]);
    expect(policy["frame-src"]).toEqual([
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
      "https://docs.google.com",
      "https://drive.google.com",
    ]);
    // And nobody may frame this site.
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
  });

  test("the browser talks to this site and the Supabase project, nothing else", () => {
    expect(policy["connect-src"]).toEqual([
      "'self'",
      "https://abcd.supabase.co",
      "wss://abcd.supabase.co",
    ]);
    expect(policy["img-src"]).toEqual(["'self'", "data:", "blob:", "https://abcd.supabase.co"]);
    expect(policy["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  test("HTTPS-only rules are sent on HTTPS sites and left out locally", () => {
    expect("upgrade-insecure-requests" in policy).toBe(true);
    const localPolicy = directives(contentSecurityPolicy(local));
    expect("upgrade-insecure-requests" in localPolicy).toBe(false);
    expect(localPolicy["connect-src"]).toEqual([
      "'self'",
      "http://127.0.0.1:54321",
      "ws://127.0.0.1:54321",
    ]);
  });

  test("development adds only what the development tools need", () => {
    const development = directives(contentSecurityPolicy({ ...local, isDevelopment: true }));
    expect(development["script-src"]).toContain("'unsafe-eval'");
    expect(policy["script-src"]).not.toContain("'unsafe-eval'");
  });

  test("a missing or malformed Supabase address does not break the policy", () => {
    const policyWithout = contentSecurityPolicy({ ...production, supabaseUrl: "" });
    expect(policyWithout).not.toContain("null");
    expect(policyWithout).not.toContain("undefined");
    expect(directives(policyWithout)["connect-src"]).toEqual(["'self'"]);
  });
});

describe("other headers", () => {
  test("the usual protections are present", () => {
    const headers = Object.fromEntries(
      securityHeaders(production).map(({ key, value }) => [key, value]),
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    // Videos and slides need full screen.
    expect(headers["Permissions-Policy"]).not.toContain("fullscreen");
  });

  test("no HTTPS pinning on a plain-HTTP local site", () => {
    const keys = securityHeaders(local).map(({ key }) => key);
    expect(keys).not.toContain("Strict-Transport-Security");
  });
});
