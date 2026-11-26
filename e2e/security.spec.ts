import { expect, test, type Page } from "@playwright/test";
import { demoCourses, demoMaterials, demoUsers, signIn } from "./helpers";

/** Collects everything the browser blocks because of the Content Security Policy. */
async function watchPolicy(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.exposeFunction("__reportBlocked", (detail: string) => blocked.push(detail));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __reportBlocked: (detail: string) => void }).__reportBlocked(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      blocked.push(message.text());
    }
  });
  return blocked;
}

test.describe("security headers", () => {
  test("every kind of response carries them", async ({ request }) => {
    for (const path of ["/pt", "/pt/login", "/pt/nao-existe", "/api/materials/x/download"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      const headers = response.headers();
      expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(headers["content-security-policy"], path).toContain(
        "frame-src https://www.youtube-nocookie.com",
      );
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(headers["x-powered-by"], path).toBeUndefined();
    }
  });

  test("the policy blocks nothing the pages need", async ({ page }) => {
    const blocked = await watchPolicy(page);

    for (const path of [
      "/pt",
      "/pt/courses",
      `/pt/courses/${demoCourses.classroom.slug}`,
      "/en/privacy",
      "/pt/auth/confirm?token_hash=abc&type=invite",
      "/pt/auth/set-password",
      "/pt/forgot-password",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);

    // The learner area: a course, a text page, the PDF viewer (its worker and the file from
    // storage) and a video frame once it has been asked for.
    const course = `/pt/learn/courses/${demoCourses.classroom.slug}`;
    await page.goto(course);
    await page.goto(`${course}/materials/${demoMaterials.promptGuide}`);
    await page.goto(`${course}/materials/${demoMaterials.slidesPdf}`);
    await expect(page.getByLabel("Página 1 de 6")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible();
    await page.goto(`${course}/materials/${demoMaterials.video}`);
    await page.getByRole("button", { name: "Mostrar vídeo" }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await page.goto("/pt/learn/account");
    await page.goto("/pt/nao-existe");
    await page.waitForLoadState("networkidle");

    expect(blocked).toEqual([]);
  });

  test("the policy really is enforced", async ({ page }) => {
    const blocked = await watchPolicy(page);
    await page.goto("/pt/login");

    // A frame from a host that is not on the list, and a script from another site.
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.src = "https://example.org/";
      document.body.append(frame);
      const script = document.createElement("script");
      script.src = "https://example.org/x.js";
      document.body.append(script);
    });
    await expect.poll(() => blocked.length).toBeGreaterThanOrEqual(2);
    expect(blocked.join("\n")).toContain("frame-src");
    expect(blocked.join("\n")).toContain("script-src");
  });
});
