import { expect, test, type Page } from "@playwright/test";
import { admin, demoCourses, field } from "./helpers";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** The course cards currently shown, by title. */
const courseTitles = (page: Page) =>
  page
    .locator("#courses, main")
    .first()
    .getByRole("listitem")
    .getByRole("heading")
    .allTextContents();

test.describe("landing page", () => {
  test("carries the platform's name in the language of the page", async ({ page }) => {
    const names = { pt: "Formação em AI", en: "AI Training" };
    const titles = {
      pt: "Formação em AI — cursos de inteligência artificial",
      en: "AI Training — artificial intelligence courses",
    };
    for (const locale of ["pt", "en"] as const) {
      await page.goto(`/${locale}`);
      await expect(page).toHaveTitle(titles[locale]);
      await expect(
        page.getByRole("banner").getByRole("link", { name: new RegExp(`^${names[locale]}:`) }),
      ).toHaveText(names[locale]);
      await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
        "content",
        names[locale],
      );
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        new RegExp(`/og-image-${locale}\\.png$`),
      );
    }
  });

  test("presents areas, levels and the published courses", async ({ page }) => {
    await page.goto("/pt");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "A Inteligência Artificial ao seu serviço",
      }),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: /Professores[\s\S]*2 cursos/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Médicos[\s\S]*2 cursos/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dois níveis, ao seu ritmo" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Iniciação" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Avançado" })).toBeVisible();

    const courses = page.locator("#courses");
    for (const title of [
      "IA na sala de aula",
      "Avaliação e feedback com IA",
      "IA na prática clínica",
      "IA para investigação clínica",
    ]) {
      await expect(courses.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Formadores" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Pedro Vicente" })).toBeVisible();
    await expect(page.getByText("Formador principal")).toBeVisible();
    await expect(page.getByRole("link", { name: "LinkedIn, Pedro Vicente" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/neteinstein/",
    );
    await expect(page.getByRole("link", { name: "pedrovicente.pt" })).toHaveAttribute(
      "href",
      "https://www.pedrovicente.pt",
    );
    // Drafts and unlisted courses never reach the public site.
    await expect(page.getByText("direções escolares")).toHaveCount(0);
    await expect(page.getByText("edição interna")).toHaveCount(0);
  });

  test("is fully translated", async ({ page }) => {
    await page.goto("/en");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Artificial Intelligence at your service",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Teachers[\s\S]*2 courses/ })).toBeVisible();
    await expect(
      page.locator("#courses").getByRole("heading", { name: "AI in the classroom", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Two levels, at your own pace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  });

  test("the hero types a request and answers it, and can be stopped", async ({ page }) => {
    await page.goto("/pt");
    // The exchange illustrates the page's text and is hidden from assistive technology, so it
    // is found by its place. It only plays on screen: on a phone it starts below the fold.
    const hero = page.locator(".hero-stage");
    await hero.scrollIntoViewIfNeeded();
    // The page opens on a finished example; then the next request is typed.
    await expect(hero).toHaveAttribute("data-stage", "typing", { timeout: 15_000 });

    // Stopping holds it where it is: the same stage, the same letters still to come.
    await page.getByRole("button", { name: "Pausar a animação" }).click();
    const resume = page.getByRole("button", { name: "Retomar a animação" });
    await expect(resume).toBeVisible();
    const moment = async () => [
      await hero.getAttribute("data-stage"),
      await hero.locator("p .invisible").textContent(),
    ];
    const stopped = await moment();
    await page.waitForTimeout(3_000);
    expect(await moment()).toEqual(stopped);

    // Started again, it finishes the request and answers it with what it made.
    await resume.click();
    await expect(hero).toHaveAttribute("data-stage", "done", { timeout: 20_000 });
    await expect(
      hero.getByText("Resume as principais conclusões destes três ensaios sobre hipertensão."),
    ).toBeVisible();
    await expect(
      hero.getByText("Aqui está o resumo, com as limitações de cada ensaio."),
    ).toBeVisible();
    await expect(hero.getByText("Limitações", { exact: true })).toBeVisible();
    await expect(hero.getByText("Medicina", { exact: true })).toBeAttached();
  });

  test("the hero keeps still for someone who asks for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en");
    const hero = page.locator(".hero-stage");
    await hero.scrollIntoViewIfNeeded();
    await expect(
      hero.getByText("Turn my lesson notes into a 10-question quiz for 8th grade."),
    ).toBeVisible();
    await expect(
      hero.getByText("Here's your quiz, with the answers and a marking guide."),
    ).toBeVisible();
    // Long enough for the first example to have given way to the next, if it were playing.
    await page.waitForTimeout(4_000);
    await expect(hero).toHaveAttribute("data-stage", "still");
    await expect(hero.getByRole("button")).toHaveCount(0);
  });

  test("answers the common questions, one at a time", async ({ page }) => {
    await page.goto("/pt#faq");
    const faq = page.locator("#faq");
    await expect(faq.getByRole("heading", { name: "Perguntas frequentes" })).toBeVisible();
    await expect(faq.getByText(/80 €/)).toBeHidden();
    await faq.getByText("Quanto custa?").click();
    await expect(faq.getByText(/80 €/)).toBeVisible();
  });

  test("the menu reaches every section, also on a phone", async ({ page }) => {
    await page.goto("/pt");
    if (isPhone(page)) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu.getByRole("link", { name: "Entrar" })).toBeVisible();
      await menu.getByRole("link", { name: "Como funciona" }).click();
      await expect(menu).toBeHidden();
    } else {
      await page
        .getByRole("navigation", { name: "Principal" })
        .getByRole("link", { name: "Como funciona" })
        .click();
    }
    await expect(page).toHaveURL(/\/pt#how-it-works$/);
    await expect(page.getByRole("heading", { name: "Como funciona" })).toBeInViewport();
  });
});

test.describe("catalogue", () => {
  test("filters by area and level, and keeps the choice in the address", async ({ page }) => {
    await page.goto("/pt/courses");
    await expect(page.getByRole("heading", { level: 1, name: "Cursos" })).toBeVisible();
    await expect(page.getByRole("listitem").getByRole("heading")).toHaveCount(4);

    await field(page, "Área").selectOption({ label: "Médicos" });
    await expect(page).toHaveURL(/\/pt\/courses\?area=medical-doctors$/);
    expect(await courseTitles(page)).toEqual([
      "IA na prática clínica",
      "IA para investigação clínica",
    ]);

    await field(page, "Nível").selectOption({ label: "Avançado" });
    await expect(page).toHaveURL(/area=medical-doctors&level=advanced$/);
    expect(await courseTitles(page)).toEqual(["IA para investigação clínica"]);

    // The address alone restores the filtered list, in the other language too.
    await page.goto("/en/courses?area=medical-doctors&level=advanced");
    await expect(field(page, "Field")).toHaveValue("medical-doctors");
    expect(await courseTitles(page)).toHaveLength(1);

    await field(page, "Field").selectOption({ label: "All fields" });
    await field(page, "Level").selectOption({ label: "All levels" });
    await expect(page).toHaveURL(/\/en\/courses$/);
    await expect(page.getByRole("listitem").getByRole("heading")).toHaveCount(4);
  });

  test("an area card on the landing page opens the catalogue for that area", async ({ page }) => {
    await page.goto("/pt");
    await page.getByRole("link", { name: /Professores[\s\S]*2 cursos/ }).click();
    await expect(page).toHaveURL(/\/pt\/courses\?area=teachers$/);
    await expect(field(page, "Área")).toHaveValue("teachers");
    expect(await courseTitles(page)).toEqual(["IA na sala de aula", "Avaliação e feedback com IA"]);
  });

  test("unknown filter values are ignored", async ({ page }) => {
    await page.goto("/pt/courses?area=nope&level=%3Cscript%3E");
    await expect(field(page, "Área")).toHaveValue("");
    await expect(page.getByRole("listitem").getByRole("heading")).toHaveCount(4);
  });
});

test.describe("course page", () => {
  test("describes the course and leads to the request form with the course chosen", async ({
    page,
  }) => {
    await page.goto(`/pt/courses/${demoCourses.classroom.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: "IA na sala de aula" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Programa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Também para Professores" })).toBeVisible();

    const aside = page.getByRole("complementary", { name: "Participar neste curso" });
    await expect(aside.getByText("8 horas")).toBeVisible();
    await aside.getByRole("link", { name: "Pedir informações" }).click();

    await expect(page).toHaveURL(new RegExp(`/pt\\?course=${demoCourses.classroom.id}#contact$`));
    await expect(field(page, "Curso de interesse")).toHaveValue(demoCourses.classroom.id);
  });

  test("tells search engines about its translation", async ({ page }) => {
    await page.goto(`/en/courses/${demoCourses.clinical.slug}`);
    await expect(page).toHaveTitle("AI in clinical practice · AI Training");
    const alternate = (lang: string) =>
      page.locator(`link[rel="alternate"][hreflang="${lang}"]`).getAttribute("href");
    expect(await alternate("pt")).toMatch(/\/pt\/courses\/ai-in-clinical-practice$/);
    expect(await alternate("en")).toMatch(/\/en\/courses\/ai-in-clinical-practice$/);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(
      /\/en\/courses\/ai-in-clinical-practice$/,
    );
  });

  test("drafts, unlisted courses and unknown addresses are not found", async ({ page }) => {
    for (const slug of [demoCourses.draft.slug, demoCourses.unlisted.slug, "no-such-course"]) {
      const response = await page.goto(`/pt/courses/${slug}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
      ).toBeVisible();
      await expect(page.getByText("direções escolares")).toHaveCount(0);

      // The very first visit to an address is streamed, so it cannot carry a 404 status;
      // it is marked "noindex" instead. Every later visit answers 404.
      if (response?.status() !== 404) {
        await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
      }
      const again = await page.request.get(`/pt/courses/${slug}`);
      expect(again.status(), slug).toBe(404);
    }
  });
});

test.describe("request form", () => {
  const stored = async (email: string) => {
    const { data } = await admin().from("info_requests").select("*").eq("email", email);
    return data ?? [];
  };

  test.beforeEach(async () => {
    // Earlier runs must not use up the form's hourly limit.
    await admin().from("info_requests").delete().like("email", "%@example.test");
  });

  test("explains what is missing, then stores a complete request", async ({ page }, testInfo) => {
    const email = `pedido-${testInfo.project.name}-${Date.now()}@example.test`;
    await page.goto(`/pt?course=${demoCourses.clinical.id}#contact`);
    const form = page.getByRole("form", { name: "Pedido de informações" });

    await form.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(form.getByRole("alert")).toContainText("Verifique os campos assinalados.");
    await expect(form.getByText("Preencha este campo.")).toHaveCount(2);
    await expect(
      form.getByText("Assinale esta caixa para podermos responder ao seu pedido."),
    ).toBeVisible();

    await field(page, "Nome").fill("Maria Santos");
    await field(page, "Email").fill("maria@");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(form.getByText("Introduza um email válido.")).toBeVisible();
    // What was typed is still there.
    await expect(field(page, "Nome")).toHaveValue("Maria Santos");
    await expect(form.getByRole("checkbox")).toBeChecked();

    await field(page, "Email").fill(email.toUpperCase());
    await field(page, "Organização (opcional)").fill("Hospital Exemplo");
    await field(page, "Mensagem (opcional)").fill("Quando começa o próximo curso?");
    await form.getByRole("button", { name: "Enviar pedido" }).click();

    await expect(page.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();
    expect(await stored(email)).toMatchObject([
      {
        name: "Maria Santos",
        email,
        organisation: "Hospital Exemplo",
        course_id: demoCourses.clinical.id,
        message: "Quando começa o próximo curso?",
        locale: "pt",
        status: "new",
      },
    ]);

    await page.getByRole("button", { name: "Enviar outro pedido" }).click();
    await expect(field(page, "Nome")).toHaveValue("");
  });

  test("a program that fills in the hidden field is thanked and ignored", async ({
    page,
  }, testInfo) => {
    const email = `robot-${testInfo.project.name}-${Date.now()}@example.test`;
    await page.goto("/en#contact");
    await field(page, "Name").fill("Robot");
    await field(page, "Email").fill(email);
    await page.getByRole("checkbox").check();
    await page.locator('input[name="website"]').evaluate((input: HTMLInputElement) => {
      input.value = "https://spam.example";
    });
    await page.getByRole("button", { name: "Send request" }).click();

    await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
    expect(await stored(email)).toEqual([]);
  });

  test("the trap field cannot be reached by people", async ({ page }) => {
    await page.goto("/pt#contact");
    const trap = page.locator('input[name="website"]');
    await expect(trap).toHaveAttribute("tabindex", "-1");
    await expect(trap).not.toBeInViewport();
    expect(await trap.evaluate((input) => input.closest("[aria-hidden='true']") !== null)).toBe(
      true,
    );
  });
});

test.describe("privacy notice and search-engine files", () => {
  test("the privacy notice exists in both languages and is linked from the form", async ({
    page,
  }) => {
    await page.goto("/pt#contact");
    await page.getByRole("link", { name: "política de privacidade" }).click();
    await expect(page).toHaveURL(/\/pt\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Política de privacidade" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Os seus direitos" })).toBeVisible();

    await page.goto("/en/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  });

  test("the sitemap lists public pages only, in both languages", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of [
      "/pt</loc>",
      "/en</loc>",
      "/pt/courses</loc>",
      `/en/courses/${demoCourses.classroom.slug}</loc>`,
      "/pt/privacy</loc>",
    ]) {
      expect(sitemap, path).toContain(path);
    }
    expect(sitemap).toContain('hreflang="en"');
    for (const hidden of [
      demoCourses.draft.slug,
      demoCourses.unlisted.slug,
      "/learn",
      "/trainer",
      "/login",
    ]) {
      expect(sitemap, hidden).not.toContain(hidden);
    }

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /*/trainer");
    expect(robots).toContain("Disallow: /*/learn");
    expect(robots).toContain("Sitemap: ");
  });
});
