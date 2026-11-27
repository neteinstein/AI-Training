import { expect, test, type Page } from "@playwright/test";
import { demoUsers, signIn, signInAsTrainer } from "./helpers";

/**
 * Light and dark. The page says which theme it shows on <html data-theme>; the colours follow
 * that attribute. Without a choice the site follows the device; a choice is kept on the device.
 */

const LIGHT_PAGE = "rgb(255, 255, 255)";
const DARK_PAGE = "rgb(11, 18, 32)";

const theme = (page: Page) => page.locator("html");
const pageColour = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("light and dark", () => {
  test("the site follows the device, and arrives already in the right theme", async ({
    page,
    request,
  }) => {
    // The theme is set by a script in <head>: it is in the page as sent, before the body, so
    // nothing is ever drawn in the wrong theme first.
    const sent = await (await request.get("/pt/login")).text();
    expect(sent.indexOf("data-theme")).toBeGreaterThan(0);
    expect(sent.indexOf("data-theme")).toBeLessThan(sent.indexOf("<body"));

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/pt/login");
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    expect(await pageColour(page)).toBe(DARK_PAGE);

    // The device changes its mind while the page is open (many do, in the evening).
    await page.emulateMedia({ colorScheme: "light" });
    await expect(theme(page)).toHaveAttribute("data-theme", "light");
    expect(await pageColour(page)).toBe(LIGHT_PAGE);
  });

  test("a chosen theme is remembered, and automatic goes back to the device", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/pt/login");

    await page.getByRole("button", { name: "Tema: Automático" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Automático" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("menuitemradio", { name: "Claro" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(theme(page)).toHaveAttribute("data-theme", "light");

    // Still light after a reload and on another page, though the device asks for dark.
    await page.reload();
    await expect(theme(page)).toHaveAttribute("data-theme", "light");
    await page.goto("/pt/forgot-password");
    await expect(theme(page)).toHaveAttribute("data-theme", "light");
    expect(await pageColour(page)).toBe(LIGHT_PAGE);

    await page.getByRole("button", { name: "Tema: Claro" }).click();
    await page.getByRole("menuitemradio", { name: "Escuro" }).click();
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Tema: Escuro" }).click();
    await page.getByRole("menuitemradio", { name: "Automático" }).click();
    await expect(theme(page)).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Tema: Automático" })).toBeVisible();
  });

  test("the public site offers the choice: in the header, or in the phone's menu", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/en");

    if (isMobile) {
      await page.getByRole("button", { name: "Open menu" }).click();
      const choices = page.getByRole("group", { name: "Theme" });
      await expect(choices.getByRole("button", { name: "Automatic" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await choices.getByRole("button", { name: "Dark" }).click();
    } else {
      await page.getByRole("button", { name: "Theme: Automatic" }).click();
      await page.getByRole("menuitemradio", { name: "Dark" }).click();
    }
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    expect(await pageColour(page)).toBe(DARK_PAGE);

    // The choice goes with the person into the other language.
    await page.getByRole("contentinfo").getByRole("link", { name: "Português" }).click();
    await expect(page).toHaveURL(/\/pt$/);
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  });

  test("a learner finds the choice in the account menu", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);

    await page.getByRole("button", { name: "Conta" }).filter({ visible: true }).click();
    const choices = page.getByRole("group", { name: "Tema" });
    await choices.getByRole("button", { name: "Escuro" }).click();
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    await expect(choices.getByRole("button", { name: "Escuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await pageColour(page)).toBe(DARK_PAGE);
  });

  test("a trainer finds it in the back-office bar, or in the phone's menu", async ({
    page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await signInAsTrainer(page);
    await page.goto("/pt/trainer/courses");

    if (isMobile) {
      // The bar of a phone keeps to where you are and the language.
      await expect(page.getByRole("button", { name: "Tema: Automático" })).toHaveCount(0);
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page
        .getByRole("group", { name: "Tema" })
        .getByRole("button", { name: "Escuro" })
        .click();
    } else {
      await page.getByRole("button", { name: "Tema: Automático" }).click();
      await page.getByRole("menuitemradio", { name: "Escuro" }).click();
    }
    await expect(theme(page)).toHaveAttribute("data-theme", "dark");
    expect(await pageColour(page)).toBe(DARK_PAGE);
  });
});
