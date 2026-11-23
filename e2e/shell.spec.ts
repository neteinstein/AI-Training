import { expect, test } from "@playwright/test";

test.describe("language routing", () => {
  test("a Portuguese browser lands on the Portuguese site", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
  });

  test.describe("with an English browser", () => {
    test.use({ locale: "en-GB" });

    test("the root URL opens the English site", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/en$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });

  test.describe("with a browser in another language", () => {
    test.use({ locale: "fr-FR" });

    test("the root URL falls back to Portuguese", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/pt$/);
    });
  });

  test("switching language keeps the page and its query string", async ({ page }) => {
    // The footer link is there at every screen size; the header switch is tested elsewhere.
    const footer = page.getByRole("contentinfo");
    await page.goto("/pt?ref=test");
    await footer.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\?ref=test$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await footer.getByRole("link", { name: "Português" }).click();
    await expect(page).toHaveURL(/\/pt\?ref=test$/);
  });

  test("an unknown page shows the not-found screen in the page's language", async ({ page }) => {
    await page.goto("/en/this-page-does-not-exist");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();

    await page.goto("/pt/esta-pagina-nao-existe");
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
  });
});

test.describe("signed-out visitors", () => {
  test("are sent to the login page from the learner area and the back-office", async ({
    request,
  }) => {
    const learner = await request.get("/pt/learn/courses/x?tab=1", { maxRedirects: 0 });
    expect(learner.status()).toBe(307);
    expect(learner.headers().location).toContain(
      "/pt/login?next=" + encodeURIComponent("/learn/courses/x?tab=1"),
    );

    const trainer = await request.get("/en/trainer", { maxRedirects: 0 });
    expect(trainer.status()).toBe(307);
    expect(trainer.headers().location).toContain(
      "/en/login?next=" + encodeURIComponent("/trainer"),
    );
  });
});
