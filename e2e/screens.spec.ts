import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  deleteUserByEmail,
  demoCourses,
  demoMaterials,
  demoUsers,
  latestEmailTo,
  signIn,
  signInAsTrainer,
  uniqueEmail,
} from "./helpers";

/**
 * Not a test of behaviour: with SCREENS=1 it saves pictures of the main screens, and of the
 * emails, into e2e-screens/. CI does this on every run and keeps the pictures for a week, so
 * a change of look can be reviewed from a pull request, by anyone, without running the site.
 *
 * Every screen is pictured in the light and in the dark theme, at each screen size: the
 * folders are `desktop`, `desktop-dark`, `phone` and `phone-dark`.
 */
for (const scheme of ["light", "dark"] as const) {
  test.describe(`pictures of the main screens, ${scheme} theme`, () => {
    test.skip(!process.env.SCREENS, "set SCREENS=1 to save them");
    // The site follows the device: a dark device gets the dark theme.
    test.use({ colorScheme: scheme });

    const classroom = demoCourses.classroom;
    const learnCourse = `/pt/learn/courses/${classroom.slug}`;
    const trainerCourse = `/pt/trainer/courses/${classroom.id}`;

    function pictureFile(project: string, name: string) {
      const folder = join("e2e-screens", scheme === "light" ? project : `${project}-dark`);
      mkdirSync(folder, { recursive: true });
      return join(folder, `${name}.png`);
    }

    // One picture pixel per page pixel, also on the phone: enough to judge a look.
    const settings = { animations: "disabled", scale: "css" } as const;

    /** A picture of the whole page, however far it goes below the screen. */
    async function shootPage(page: Page, project: string, name: string) {
      await page.screenshot({ path: pictureFile(project, name), fullPage: true, ...settings });
    }

    /**
     * The same, for a page with parts that depend on the screen. The back-office menu is pinned
     * to the screen and one screen tall, and the PDF viewer only draws the pages near the
     * screen: in a picture taller than the screen the menu would end part-way down and the last
     * pages would be blank, which nobody ever sees. So the screen is first made as tall as the
     * page. `ready` waits for whatever only appears on that taller screen.
     */
    async function shootPageOnTallScreen(
      page: Page,
      project: string,
      name: string,
      ready?: () => Promise<void>,
    ) {
      const screen = page.viewportSize();
      if (!screen) throw new Error("These pictures need a screen of a fixed size.");
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      if (height > screen.height) await page.setViewportSize({ width: screen.width, height });
      try {
        await ready?.();
        await shootPage(page, project, name);
      } finally {
        await page.setViewportSize(screen);
      }
    }

    /** A picture of the screen as it is: for what is drawn over the page, a menu or a dialog. */
    async function shootScreen(page: Page, project: string, name: string) {
      await page.screenshot({ path: pictureFile(project, name), ...settings });
    }

    async function open(page: Page, path: string) {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      // Web fonts change every line: wait until they are in.
      await page.evaluate(() => document.fonts.ready);
    }

    test("public site", async ({ page }, info) => {
      const pages = {
        "public-1-landing": "/pt",
        "public-2-catalogue": "/pt/courses",
        "public-3-course": `/pt/courses/${classroom.slug}`,
        "public-4-sign-in": "/pt/login",
        "public-5-not-found": "/pt/esta-pagina-nao-existe",
        "public-6-landing-english": "/en",
      };
      for (const [name, path] of Object.entries(pages)) {
        await open(page, path);
        await shootPage(page, info.project.name, name);
      }
    });

    test("learner area", async ({ page }, info) => {
      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      const pages = {
        "learner-1-my-courses": "/pt/learn",
        "learner-2-course": learnCourse,
        "learner-3-text-page": `${learnCourse}/materials/${demoMaterials.promptGuide}`,
        "learner-4-video": `${learnCourse}/materials/${demoMaterials.video}`,
        "learner-6-account": "/pt/learn/account",
      };
      for (const [name, path] of Object.entries(pages)) {
        await open(page, path);
        await shootPage(page, info.project.name, name);
      }

      // The PDF viewer draws its pages after the page itself has loaded, and only those near
      // the screen. It shows a page's canvas once that page has been drawn.
      await open(page, `${learnCourse}/materials/${demoMaterials.slidesPdf}`);
      const drawn = page.locator("[data-page] canvas").filter({ visible: true });
      await expect(drawn.first()).toBeVisible({ timeout: 20_000 });
      const pageCount = await page.locator("[data-page]").count();
      await shootPageOnTallScreen(page, info.project.name, "learner-5-pdf", async () => {
        await expect(drawn).toHaveCount(pageCount, { timeout: 20_000 });
      });
    });

    test("back-office", async ({ page }, info) => {
      test.slow();
      await signInAsTrainer(page);
      const pages = {
        "office-1-dashboard": "/pt/trainer",
        "office-2-courses": "/pt/trainer/courses",
        "office-3-course-content": `${trainerCourse}/content`,
        "office-4-course-details": trainerCourse,
        "office-5-text-page-form": `${trainerCourse}/content/materials/${demoMaterials.promptGuide}`,
        "office-6-learners": `${trainerCourse}/learners`,
        "office-7-area-form": "/pt/trainer/areas/new",
        "office-8-users": "/pt/trainer/users",
        "office-9-invite": "/pt/trainer/users/invite",
      };
      for (const [name, path] of Object.entries(pages)) {
        await open(page, path);
        await shootPageOnTallScreen(page, info.project.name, name);
      }

      // A menu and the question before deleting are drawn over the page, on the screen.
      await open(page, `${trainerCourse}/content`);
      await page.getByRole("button", { name: "Mais ações: Guia de prompts" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shootScreen(page, info.project.name, "office-10-row-menu");
      await page.getByRole("menuitem", { name: "Eliminar" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await shootScreen(page, info.project.name, "office-11-confirm");
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    });

    test("emails", async ({ page }, info) => {
      // Emails look the same whatever the screen or the site's theme, so one set is enough.
      test.skip(
        info.project.name !== "desktop" || scheme !== "light",
        "saved once, from the desktop project",
      );
      const email = uniqueEmail("imagem");
      try {
        const { error } = await admin().auth.admin.inviteUserByEmail(email, {
          data: { full_name: "Pessoa Convidada", locale: "pt" },
        });
        expect(error).toBeNull();
        const invitation = await latestEmailTo(email);
        await page.setViewportSize({ width: 700, height: 900 });
        await page.setContent(invitation.html);
        await shootPage(page, info.project.name, "email-1-invitation");
      } finally {
        await deleteUserByEmail(email);
      }
    });
  });
}
