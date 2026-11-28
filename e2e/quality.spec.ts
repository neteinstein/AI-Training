import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  demoConversations,
  demoCourses,
  demoEditions,
  demoMaterials,
  demoModules,
  demoQuiz,
  demoUsers,
  signIn,
  signInAsTrainer,
} from "./helpers";

/**
 * Checks that apply to every screen: the automated accessibility rules (WCAG 2.1 A and AA,
 * plus the 2.2 additions) in the light and the dark theme, no error while the page loads, and
 * no sideways scrolling on the narrowest phones.
 *
 * Automated rules find perhaps a third of accessibility problems. The rest is covered by the
 * tests that use each screen through roles and names, as assistive technology does, and by
 * the keyboard tests at the end of this file.
 */

const classroom = demoCourses.classroom;
const learnCourse = `/pt/learn/courses/${classroom.slug}`;
const trainerCourse = `/pt/trainer/courses/${classroom.id}`;

const publicPages = [
  "/pt",
  "/en",
  "/pt/courses",
  `/pt/courses/${classroom.slug}`,
  "/pt/privacy",
  "/pt/login",
  "/pt/forgot-password",
  "/pt/esta-pagina-nao-existe",
];

const learnerPages = [
  "/pt/learn",
  learnCourse,
  `${learnCourse}/materials/${demoMaterials.promptGuide}`,
  `${learnCourse}/materials/${demoMaterials.video}`,
  `${learnCourse}/materials/${demoMaterials.link}`,
  `${learnCourse}/materials/${demoMaterials.slidesPdf}`,
  `${learnCourse}/materials/${demoMaterials.quiz}`,
  // Ana's conversation with the trainers of the course: both sides have written.
  `${learnCourse}/messages`,
  "/pt/learn/account",
];

const trainerPages = [
  "/pt/trainer",
  "/pt/trainer/courses",
  "/pt/trainer/courses/new",
  trainerCourse,
  `${trainerCourse}/content`,
  `${trainerCourse}/content/modules/new`,
  `${trainerCourse}/content/materials/${demoMaterials.promptGuide}`,
  `${trainerCourse}/content/materials/${demoMaterials.slidesPdf}`,
  `${trainerCourse}/content/materials/${demoMaterials.video}`,
  `${trainerCourse}/content/materials/${demoMaterials.quiz}`,
  `${trainerCourse}/content/materials/new?module=${demoModules.classroomIntro}&kind=quiz`,
  `${trainerCourse}/learners`,
  `${trainerCourse}/learners/${demoUsers.ana.id}`,
  `${trainerCourse}/editions`,
  `${trainerCourse}/editions/new`,
  `${trainerCourse}/editions/${demoEditions.classroomInPerson}`,
  // One edition's view of the content, and a trainer's preview of what it gets.
  `${trainerCourse}/content?edition=${demoEditions.classroomInPerson}`,
  `${trainerCourse}/content/materials/new?module=${demoModules.classroomIntro}&kind=page&edition=${demoEditions.classroomInPerson}`,
  `${learnCourse}?edition=${demoEditions.classroomInPerson}`,
  "/pt/trainer/areas",
  "/pt/trainer/areas/new",
  "/pt/trainer/levels",
  "/pt/trainer/users",
  "/pt/trainer/users/invite",
  `/pt/trainer/users/${demoUsers.ana.id}`,
  "/pt/trainer/requests",
  // What learners wrote: those waiting, all of them, and one conversation.
  "/pt/trainer/messages",
  "/pt/trainer/messages?show=all&course=all",
  `/pt/trainer/messages/${demoConversations[0].id}`,
  "/pt/trainer/backup",
  "/en/trainer/courses",
];

async function settle(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main#content, main").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Parts of a page fade in as it opens (the landing page's heading and buttons). Checked
  // half-way, their text is still partly see-through and fails the contrast rule, so wait for
  // every animation that ends; those that loop (the hero's orbit) never do.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) =>
          animation.finished.then(
            () => undefined,
            () => undefined,
          ),
        ),
    ).then(() => undefined),
  );
}

/**
 * What is wrong with each page, as readable lines: the accessibility problems the automated
 * rules find, and any error the page reports while it loads.
 *
 * The second catches a text that the server and the browser write differently (a date, say).
 * React then reports an error, throws that part of the page away and draws it again, and
 * whatever was typed in the meantime is lost. Nothing looks wrong afterwards, so only the
 * report gives it away.
 */
async function accessibilityProblems(page: Page, paths: string[]): Promise<string[]> {
  const problems: string[] = [];
  let current = "";
  const reported = (error: Error) =>
    problems.push(`${current} · error while loading · ${error.message.split(";")[0]}`);
  page.on("pageerror", reported);
  try {
    for (const path of paths) {
      current = path;
      await settle(page, path);
      // (The cast bridges two copies of Playwright's types; the page object is the same.)
      const { violations } = await new AxeBuilder({ page: page as never })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      for (const violation of violations) {
        for (const node of violation.nodes) {
          problems.push(`${path} · ${violation.id} · ${node.target.join(" ")}`);
        }
      }
    }
  } finally {
    page.off("pageerror", reported);
  }
  return problems;
}

/** Pages that are wider than a 320px screen, with by how much. */
async function overflowing(page: Page, paths: string[]): Promise<string[]> {
  const wide: string[] = [];
  for (const path of paths) {
    await settle(page, path);
    const extra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (extra > 1) wide.push(`${path} is ${extra}px too wide`);
  }
  return wide;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility rules, ${scheme} theme`, () => {
    // Colours do not depend on the size of the screen: the dark pass runs once.
    test.skip(
      ({ isMobile }) => scheme === "dark" && isMobile,
      "the dark theme is checked in the desktop project",
    );
    test.use({ colorScheme: scheme });

    test("public pages", async ({ page }) => {
      expect(await accessibilityProblems(page, publicPages)).toEqual([]);
    });

    test("learner area", async ({ page }) => {
      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      expect(await accessibilityProblems(page, learnerPages)).toEqual([]);
    });

    test("back-office", async ({ page }) => {
      test.slow();
      await signInAsTrainer(page);
      expect(await accessibilityProblems(page, trainerPages)).toEqual([]);
    });

    // A graded quiz only exists after handing one in: its right, wrong and chosen answers are
    // the only place these colours are used together.
    test("a graded quiz", async ({ page }) => {
      const quiz = `${learnCourse}/materials/${demoMaterials.quiz}`;
      const hers = { user_id: demoUsers.ana.id, material_id: demoMaterials.quiz };
      try {
        await signIn(page, demoUsers.ana.email);
        await expect(page).toHaveURL(/\/pt\/learn$/);
        await settle(page, quiz);
        const [first, second, third] = demoQuiz;
        // One right, one half right, one wrong: every kind of line is on the page.
        await page.getByRole("radio", { name: first.right[0], exact: true }).check();
        await page.getByRole("checkbox", { name: second.right[0], exact: true }).check();
        await page.getByRole("checkbox", { name: second.options[2], exact: true }).check();
        await page.getByRole("radio", { name: third.options[1], exact: true }).check();
        await page.getByRole("button", { name: "Entregar" }).click();
        await expect(
          page.getByRole("heading", { level: 2, name: "Acertou 1 de 3." }),
        ).toBeVisible();
        const { violations } = await new AxeBuilder({ page: page as never })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.flatMap((violation) =>
            violation.nodes.map((node) => `${violation.id} · ${node.target.join(" ")}`),
          ),
        ).toEqual([]);
      } finally {
        await admin().from("quiz_attempts").delete().match(hers);
        await admin().from("material_progress").delete().match(hers);
      }
    });
  });
}

test.describe("on the narrowest phones", () => {
  // One pass is enough: the page's width does not depend on the device being emulated.
  test.skip(({ isMobile }) => !isMobile, "checked in the phone project");
  test.use({ viewport: { width: 320, height: 700 } });

  test("public pages do not scroll sideways", async ({ page }) => {
    expect(await overflowing(page, publicPages)).toEqual([]);
  });

  test("the learner area does not scroll sideways", async ({ page }) => {
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    expect(await overflowing(page, learnerPages)).toEqual([]);
  });

  test("the back-office does not scroll sideways", async ({ page }) => {
    test.slow();
    await signInAsTrainer(page);
    expect(await overflowing(page, trainerPages)).toEqual([]);
  });
});

test.describe("between a phone and a laptop", () => {
  // The narrowest screen that gets the full header instead of the phone's menu button.
  test.skip(({ isMobile }) => isMobile, "checked in the desktop project");
  test.use({ viewport: { width: 768, height: 800 } });

  test("the public header keeps to one line, in both languages", async ({ page }) => {
    for (const path of ["/pt", "/en"]) {
      await settle(page, path);
      // Every link and button of the header is one line of text in a 44px control. A name
      // or a menu item that wraps onto a second line makes its control taller.
      const tallest = await page.evaluate(() =>
        Math.max(
          ...[...document.querySelectorAll("header a, header button")]
            .filter((element) => element.getClientRects().length > 0)
            .map((element) => element.getBoundingClientRect().height),
        ),
      );
      expect(tallest, path).toBeLessThanOrEqual(48);
    }
    expect(await overflowing(page, ["/pt", "/en"])).toEqual([]);
  });

  test("the back-office menu keeps every entry to one line, in both languages", async ({
    page,
  }) => {
    await signInAsTrainer(page);
    // On the backup page its own entry, the longest of the menu, is bold: the widest it gets.
    for (const path of ["/pt/trainer/backup", "/en/trainer/backup"]) {
      await settle(page, path);
      await expect(page.locator("aside nav a").first()).toBeVisible();
      // An entry is one line of text in a 44px link; a second line makes the link taller.
      const entries = await page.evaluate(() =>
        [...document.querySelectorAll("aside nav a")]
          .filter((link) => link.getClientRects().length > 0)
          .map((link) => ({
            entry: link.textContent,
            height: Math.round(link.getBoundingClientRect().height),
          })),
      );
      expect(entries.length, path).toBeGreaterThan(5);
      expect(
        entries.filter((entry) => entry.height > 48),
        path,
      ).toEqual([]);
    }
  });

  test("the back-office does not scroll sideways beside its menu", async ({ page }) => {
    // The narrowest the pages get with the menu beside them rather than behind a button.
    test.slow();
    await signInAsTrainer(page);
    expect(await overflowing(page, trainerPages)).toEqual([]);
  });
});

test.describe("with the keyboard alone", () => {
  test.skip(({ isMobile }) => isMobile, "a physical keyboard goes with the desktop project");

  test("the course builder: fold a module, switch visibility, use a row's menu", async ({
    page,
  }) => {
    await signInAsTrainer(page);
    // These widgets only answer once the page's scripts have started.
    await settle(page, `${trainerCourse}/content`);

    // A folded module opens with Enter and says so.
    const toggle = page.getByRole("button", { name: "Abrir Planificar aulas" });
    await toggle.focus();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    const opened = page.getByRole("button", { name: "Fechar Planificar aulas" });
    await expect(opened).toHaveAttribute("aria-expanded", "true");
    await expect(opened).toBeFocused();
    await expect(page.getByRole("link", { name: "Plano de aula modelo" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // The switch is a switch: Space flips it, and it keeps the focus. Each change is waited
    // for in the database, so the demo material is certain to end hidden, as it began.
    const visibility = page.getByRole("switch", {
      name: "Visível para os formandos: Notas do formador (rascunho)",
    });
    const saved = async () =>
      (
        await admin()
          .from("materials")
          .select("is_published")
          .eq("id", demoMaterials.hiddenNotes)
          .single()
      ).data?.is_published;
    try {
      await visibility.focus();
      await expect(visibility).not.toBeChecked();
      await page.keyboard.press("Space");
      await expect(visibility).toBeChecked();
      await expect(visibility).toBeFocused();
      await expect.poll(saved).toBe(true);
      await page.keyboard.press("Space");
      await expect(visibility).not.toBeChecked();
      await expect.poll(saved).toBe(false);
    } finally {
      await admin()
        .from("materials")
        .update({ is_published: false })
        .eq("id", demoMaterials.hiddenNotes);
    }

    // The menu opens on its first entry, the arrows move through it, Escape gives the focus back.
    const more = page.getByRole("button", { name: "Mais ações: Guia de prompts" });
    await more.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Editar" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Ver como formando" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Eliminar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();

    // Choosing "delete" asks first; the question keeps the focus inside until it is answered.
    // Each key waits for what the one before it did: the menu and the dialog take a moment
    // to place the focus.
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: "Editar" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Eliminar" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Eliminar «Guia de prompts»?");
    const focusInside = () =>
      dialog.evaluate((element) => element.contains(document.activeElement));
    await expect.poll(focusInside).toBe(true);
    for (let presses = 0; presses < 4; presses += 1) {
      await page.keyboard.press("Tab");
      expect(await focusInside(), "focus stays in the dialog").toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Guia de prompts" })).toBeVisible();
  });

  test("a list: moving keeps the place, and a cancelled deletion returns to its button", async ({
    page,
  }) => {
    await signInAsTrainer(page);
    await settle(page, "/pt/trainer/levels");

    // An unavailable move stays reachable and says it is unavailable, instead of vanishing
    // from the tab order.
    const firstUp = page.getByRole("button", { name: "Mover Iniciação para cima" });
    await firstUp.focus();
    await expect(firstUp).toBeFocused();
    await expect(firstUp).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("list", { name: "Níveis" }).locator("> li > span.flex-col > span:first-child"),
    ).toHaveText(["Iniciação", "Avançado"]);

    const remove = page.getByRole("button", { name: "Eliminar Avançado" });
    await remove.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
  });

  test("the skip link is the first stop and leads into the page", async ({ page }) => {
    await signInAsTrainer(page);
    await settle(page, "/pt/trainer/courses");
    await expect(page.getByRole("heading", { level: 1, name: "Cursos" })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#content$/);
    // The next stop is inside the page's main part, past the menu.
    await page.keyboard.press("Tab");
    const inMain = await page.evaluate(
      () => document.querySelector("main#content")?.contains(document.activeElement) ?? false,
    );
    expect(inMain).toBe(true);
  });
});
