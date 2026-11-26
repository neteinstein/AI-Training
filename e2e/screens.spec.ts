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
 */
test.describe("pictures of the main screens", () => {
  test.skip(!process.env.SCREENS, "set SCREENS=1 to save them");

  const classroom = demoCourses.classroom;
  const learnCourse = `/pt/learn/courses/${classroom.slug}`;
  const trainerCourse = `/pt/trainer/courses/${classroom.id}`;

  async function shoot(page: Page, project: string, name: string) {
    const folder = join("e2e-screens", project);
    mkdirSync(folder, { recursive: true });
    await page.screenshot({
      path: join(folder, `${name}.png`),
      fullPage: true,
      animations: "disabled",
      // One picture pixel per page pixel, also on the phone: enough to judge a look.
      scale: "css",
    });
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
      await shoot(page, info.project.name, name);
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
      await shoot(page, info.project.name, name);
    }
    // The PDF viewer draws its pages after the page itself has loaded.
    await open(page, `${learnCourse}/materials/${demoMaterials.slidesPdf}`);
    await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
    await shoot(page, info.project.name, "learner-5-pdf");
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
      await shoot(page, info.project.name, name);
    }

    // A menu and the question before deleting: both are drawn over the page.
    await open(page, `${trainerCourse}/content`);
    await page.getByRole("button", { name: "Mais ações: Guia de prompts" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await shoot(page, info.project.name, "office-10-row-menu");
    await page.getByRole("menuitem", { name: "Eliminar" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await shoot(page, info.project.name, "office-11-confirm");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
  });

  test("emails", async ({ page }, info) => {
    // Emails look the same whatever the screen, so one set is enough.
    test.skip(info.project.name !== "desktop", "saved once, from the desktop project");
    const email = uniqueEmail("imagem");
    try {
      const { error } = await admin().auth.admin.inviteUserByEmail(email, {
        data: { full_name: "Pessoa Convidada", locale: "pt" },
      });
      expect(error).toBeNull();
      const invitation = await latestEmailTo(email);
      await page.setViewportSize({ width: 700, height: 900 });
      await page.setContent(invitation.html);
      await shoot(page, info.project.name, "email-1-invitation");
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
