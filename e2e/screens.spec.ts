import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  deleteUserByEmail,
  demoConversations,
  demoCourses,
  demoEditions,
  demoMaterials,
  demoQuiz,
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

    /**
     * For the pictures, Ana has opened exactly two materials of the demo course, two days ago,
     * whatever the tests before this one did as her. (Nothing else depends on what she opened.)
     */
    async function showSomeProgress() {
      const service = admin();
      const { data: modules } = await service
        .from("modules")
        .select("materials(id)")
        .eq("course_id", classroom.id);
      const all = (modules ?? []).flatMap((module) => module.materials.map(({ id }) => id));
      await service
        .from("material_progress")
        .delete()
        .eq("user_id", demoUsers.ana.id)
        .in("material_id", all);
      const when = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const opened = await service.from("material_progress").insert(
        [demoMaterials.video, demoMaterials.promptGuide].map((material_id) => ({
          user_id: demoUsers.ana.id,
          material_id,
          opened_at: when,
          last_opened_at: when,
          completed_at: when,
        })),
      );
      expect(opened.error).toBeNull();
    }

    /** Takes away what Ana handed in of the demo quiz, and that she opened it. */
    async function removeDemoAttempts() {
      const hers = { user_id: demoUsers.ana.id, material_id: demoMaterials.quiz };
      await admin().from("quiz_attempts").delete().match(hers);
      await admin().from("material_progress").delete().match(hers);
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
      // The list of courses and the course itself come first: opening the materials after
      // them is noted, and would change what these two show.
      await showSomeProgress();
      const pages = {
        "learner-1-my-courses": "/pt/learn",
        "learner-2-course": learnCourse,
        "learner-3-text-page": `${learnCourse}/materials/${demoMaterials.promptGuide}`,
        "learner-4-video": `${learnCourse}/materials/${demoMaterials.video}`,
        "learner-6-account": "/pt/learn/account",
        "learner-7-quiz": `${learnCourse}/materials/${demoMaterials.quiz}`,
        // Her conversation with the trainers of the course.
        "learner-9-messages": `${learnCourse}/messages`,
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

      // A quiz handed in with one answer wrong, to show a result with both kinds. What Ana
      // hands in here is removed again, so the demo quiz stays untouched for the other tests.
      try {
        await open(page, `${learnCourse}/materials/${demoMaterials.quiz}`);
        const [first, second, third] = demoQuiz;
        await page.getByRole("radio", { name: first.options[1], exact: true }).check();
        for (const label of second.right) {
          await page.getByRole("checkbox", { name: label, exact: true }).check();
        }
        await page.getByRole("radio", { name: third.right[0], exact: true }).check();
        await page.getByRole("button", { name: "Entregar" }).click();
        await expect(
          page.getByRole("heading", { level: 2, name: "Acertou 2 de 3." }),
        ).toBeVisible();
        await expect(page.getByText(/^Melhor resultado/)).toBeVisible();
        await shootPage(page, info.project.name, "learner-8-quiz-result");
      } finally {
        await removeDemoAttempts();
      }
    });

    test("back-office", async ({ page }, info) => {
      test.slow();
      await signInAsTrainer(page);
      const inPerson = demoEditions.classroomInPerson;
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
        "office-13-editions": `${trainerCourse}/editions`,
        "office-14-edition-form": `${trainerCourse}/editions/${inPerson}`,
        "office-15-edition-content": `${trainerCourse}/content?edition=${inPerson}`,
        // What a trainer sees when looking at the course as one edition's learners do.
        "office-16-edition-preview": `${learnCourse}?edition=${inPerson}`,
        // What one learner has opened.
        "office-17-learner-progress": `${trainerCourse}/learners/${demoUsers.ana.id}`,
        // A quiz: its questions, and below them what each learner has handed in.
        "office-18-quiz-form": `${trainerCourse}/content/materials/${demoMaterials.quiz}`,
        // What learners wrote to their trainers: every conversation, then one of them.
        "office-19-messages": "/pt/trainer/messages?show=all",
        "office-20-conversation": `/pt/trainer/messages/${demoConversations[0].id}`,
      };
      await showSomeProgress();
      // For the pictures only, the demo course's second edition gets a learner too, so that
      // the list of learners shows both editions with someone in them.
      const guest = { user_id: demoUsers.john.id, course_id: classroom.id };
      const joined = await admin()
        .from("enrollments")
        .upsert({ ...guest, edition_id: inPerson }, { onConflict: "user_id,course_id" });
      expect(joined.error).toBeNull();
      // And, for the pictures only, Ana has handed in the demo quiz twice.
      const handedIn = await admin()
        .from("quiz_attempts")
        .insert(
          [2, 3].map((correct_count) => ({
            user_id: demoUsers.ana.id,
            material_id: demoMaterials.quiz,
            correct_count,
            question_count: 3,
            detail: [],
          })),
        );
      expect(handedIn.error).toBeNull();
      // Handing in is what marks a quiz as done; these two were put in directly.
      const done = await admin().from("material_progress").upsert(
        {
          user_id: demoUsers.ana.id,
          material_id: demoMaterials.quiz,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,material_id" },
      );
      expect(done.error).toBeNull();
      try {
        for (const [name, path] of Object.entries(pages)) {
          await open(page, path);
          await shootPageOnTallScreen(page, info.project.name, name);
        }
      } finally {
        await admin().from("enrollments").delete().match(guest);
        await removeDemoAttempts();
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

      // On a phone the back-office menu opens over the page; it also holds the theme choice.
      const menuButton = page.getByRole("button", { name: "Abrir menu" });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        const sheet = page.getByRole("dialog", { name: "Menu" });
        await expect(sheet.getByRole("group", { name: "Tema" })).toBeVisible();
        // The sheet starts out see-through and then slides in: a picture taken at once
        // would show the page with nothing over it.
        await expect(sheet).toHaveCSS("opacity", "1");
        await shootScreen(page, info.project.name, "office-12-menu");
      }
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
