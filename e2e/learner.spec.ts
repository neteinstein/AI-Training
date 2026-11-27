import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  deleteUserByEmail,
  demoCourses,
  demoMaterials,
  demoUsers,
  field,
  signIn,
  signOut,
  uniqueEmail,
} from "./helpers";

const classroom = `/pt/learn/courses/${demoCourses.classroom.slug}`;
const material = (id: string) => `${classroom}/materials/${id}`;

async function signInAs(page: Page, user: { email: string }, locale: "pt" | "en" = "pt") {
  await signIn(page, user.email, undefined, locale);
  await expect(page).toHaveURL(new RegExp(`/${locale}/(learn|trainer)$`));
}

test.describe("my courses", () => {
  test("a learner sees the courses they are enrolled in, and only those", async ({ page }) => {
    await signInAs(page, demoUsers.ana);
    await expect(page.getByRole("heading", { level: 1, name: "Os meus cursos" })).toBeVisible();
    await expect(page.getByText("Olá, Ana Santos")).toBeVisible();

    const cards = page.getByRole("listitem").getByRole("heading", { level: 2 });
    await expect(cards).toHaveText(["IA na sala de aula", "IA na sala de aula (edição interna)"]);

    await page.getByRole("link", { name: /^Professores\s*IA na sala de aula\s*Primeiros/ }).click();
    await expect(page).toHaveURL(new RegExp(`${classroom}$`));
    await expect(page.getByRole("heading", { level: 1, name: "IA na sala de aula" })).toBeVisible();
  });

  test("someone with no courses is told what will happen", async ({ page }) => {
    const email = uniqueEmail("sem-cursos");
    const { error } = await admin().auth.admin.createUser({
      email,
      password: "demo-password-123",
      email_confirm: true,
      user_metadata: { full_name: "Sem Cursos", locale: "pt" },
    });
    expect(error).toBeNull();
    try {
      await signInAs(page, { email });
      await expect(page.getByRole("heading", { name: "Ainda não tem cursos" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Ver os cursos disponíveis" })).toHaveAttribute(
        "href",
        "/pt/courses",
      );
    } finally {
      await deleteUserByEmail(email);
    }
  });
});

test.describe("a course", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, demoUsers.ana);
    await page.goto(classroom);
  });

  test("lists its modules and the materials a learner may see", async ({ page }) => {
    const first = page.locator("details").first();
    await expect(first).toHaveAttribute("open", "");
    await expect(first.getByText("1. Introdução")).toBeVisible();
    await expect(first.getByText("4 materiais")).toBeVisible();
    await expect(first.getByRole("listitem")).toHaveCount(4);

    await expect(first.getByText(/^PDF · .* · EN$/)).toBeVisible();
    await expect(first.getByText("Vídeo · YouTube · EN")).toBeVisible();
    await expect(first.getByText("Página", { exact: true })).toBeVisible();
    // The trainer's hidden draft is not there.
    await expect(page.getByText("Notas do formador")).toHaveCount(0);

    // Other modules open on request.
    const second = page.locator("details").nth(1);
    await expect(second.getByText("Plano de aula modelo")).toBeHidden();
    await second.getByText("2. Planificar aulas").click();
    await expect(second.getByText("Plano de aula modelo")).toBeVisible();
    await expect(page.locator("details").nth(2).getByText("Ainda sem materiais")).toBeVisible();
  });

  test("an external link opens the other site in a new tab; a file can be downloaded directly", async ({
    page,
  }) => {
    const link = page.getByRole("link", { name: /Leitura recomendada/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // It goes through the site, which notes the opening and sends the browser on.
    const through = `/api/materials/${demoMaterials.link}/open`;
    await expect(link).toHaveAttribute("href", through);
    const answer = await page.request.get(through, { maxRedirects: 0 });
    expect(answer.status()).toBe(302);
    expect(answer.headers().location).toBe(
      "https://en.wikipedia.org/wiki/Generative_artificial_intelligence",
    );

    const download = page.getByRole("link", { name: "Descarregar Diapositivos da sessão 1" });
    await expect(download).toHaveAttribute(
      "href",
      `/api/materials/${demoMaterials.slidesPdf}/download`,
    );
    const file = await page.request.get((await download.getAttribute("href")) ?? "");
    expect(file.headers()["content-type"]).toContain("application/pdf");
  });
});

test.describe("materials", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, demoUsers.ana);
  });

  test("a text page reads comfortably and its example can be copied", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are a Chromium feature");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(material(demoMaterials.promptGuide));

    await expect(page.getByText("Módulo 1 · Introdução")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Guia de prompts" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "As quatro partes" })).toBeVisible();
    await expect(page.getByText("Prompt", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Copiar" }).click();
    await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^És um professor de Ciências do 7\.º ano\.[\s\S]*numa tabela\.$/);
  });

  test("a video is only loaded when asked for, and the choice can be remembered", async ({
    page,
  }) => {
    await page.goto(material(demoMaterials.video));
    await expect(page.getByText("Este conteúdo está alojado no YouTube.")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);

    await page.getByRole("button", { name: "Mostrar vídeo" }).click();
    const frame = page.locator("iframe");
    await expect(frame).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0&autoplay=1",
    );
    await expect(frame).toHaveAttribute("title", "Vídeo de exemplo");

    // Asked once: the next visit asks again. Remembered: it shows at once, without autoplay.
    await page.reload();
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByLabel("Mostrar sempre conteúdo do YouTube neste dispositivo").check();
    await expect(page.locator("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0",
    );
    await page.reload();
    await expect(page.locator("iframe")).toHaveCount(1);

    await expect(page.getByRole("link", { name: /Abrir no YouTube/ })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    );
    await page.getByLabel("Mostrar sempre conteúdo do YouTube neste dispositivo").uncheck();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("a PDF opens in the built-in viewer, at any screen size", async ({ page }) => {
    await page.goto(material(demoMaterials.slidesPdf));
    await expect(
      page.getByRole("heading", { level: 1, name: "Diapositivos da sessão 1" }),
    ).toBeVisible();

    const toolbar = page.getByRole("toolbar", { name: "Controlos do documento" });
    await expect(toolbar.getByLabel("Página 1 de 6")).toBeVisible({ timeout: 20_000 });
    // The pages are really drawn, and their text can be selected and read aloud.
    const firstPage = page.locator('[data-page="1"]');
    await expect(firstPage.locator("canvas")).toBeVisible();
    await expect(firstPage.getByText("AI Training - sample slides")).toBeAttached();

    const widthBefore = (await firstPage.boundingBox())?.width ?? 0;
    await toolbar.getByRole("button", { name: "Ampliar" }).click();
    await expect(toolbar.getByText("125%")).toBeVisible();
    await expect
      .poll(async () => (await firstPage.boundingBox())?.width ?? 0)
      .toBeGreaterThan(widthBefore * 1.2);
    // A zoomed page scrolls inside the viewer; the page itself never scrolls sideways.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await toolbar.getByRole("button", { name: "Reduzir" }).click();
    await expect(toolbar.getByText("100%")).toBeVisible();

    await page.locator('[data-page="6"]').scrollIntoViewIfNeeded();
    await expect(toolbar.getByLabel("Página 6 de 6")).toBeVisible();

    const base = `/api/materials/${demoMaterials.slidesPdf}/download`;
    await expect(toolbar.getByRole("link", { name: "Descarregar" })).toHaveAttribute("href", base);
    await expect(toolbar.getByRole("link", { name: "Abrir num novo separador" })).toHaveAttribute(
      "href",
      `${base}?inline=1`,
    );
  });

  test("previous and next walk through the whole course", async ({ page }) => {
    await page.goto(material(demoMaterials.slidesPdf));
    const nav = page.getByRole("navigation", { name: "Materiais do curso" });
    await expect(nav.getByText("Primeiro material")).toBeVisible();

    const visited = ["Diapositivos da sessão 1"];
    for (const title of [
      "Vídeo de exemplo",
      "Leitura recomendada",
      "Guia de prompts",
      "Plano de aula modelo",
      "Verifique o que aprendeu",
    ]) {
      await nav.getByRole("link", { name: new RegExp(`Seguinte\\s*${title}`) }).click();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      visited.push(title);
    }
    await expect(nav.getByText("Último material")).toBeVisible();
    // The last one is in the second module.
    await expect(page.getByText("Módulo 2 · Planificar aulas")).toBeVisible();

    await nav.getByRole("link", { name: /Anterior\s*Plano de aula modelo/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Plano de aula modelo" }),
    ).toBeVisible();
    expect(visited).toHaveLength(6);
  });

  test("a link has a page of its own, for people who arrive there with 'next'", async ({
    page,
  }) => {
    await page.goto(material(demoMaterials.link));
    const open = page.getByRole("link", { name: "Abrir ligação" });
    await expect(open).toHaveAttribute("href", `/api/materials/${demoMaterials.link}/open`);
    await expect(open).toHaveAttribute("target", "_blank");
    // The address itself is still shown, so people see where they are going.
    await expect(
      page.getByText("https://en.wikipedia.org/wiki/Generative_artificial_intelligence"),
    ).toBeVisible();
  });
});

test.describe("what a learner cannot reach", () => {
  test("another course, its materials, a hidden material, a nonsense address", async ({ page }) => {
    await signInAs(page, demoUsers.john, "en");
    for (const path of [
      `/en/learn/courses/${demoCourses.classroom.slug}`,
      `/en/learn/courses/${demoCourses.classroom.slug}/materials/${demoMaterials.promptGuide}`,
      `/en/learn/courses/${demoCourses.draft.slug}`,
      "/en/learn/courses/no-such-course",
      `/en/learn/courses/${demoCourses.clinical.slug}/materials/not-an-id`,
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: "Page not found" }),
        path,
      ).toBeVisible();
    }
    // Their own course works.
    await page.goto(`/en/learn/courses/${demoCourses.clinical.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "AI in clinical practice" }),
    ).toBeVisible();
  });

  test("a hidden material has no page for the learners of the course", async ({ page }) => {
    await signInAs(page, demoUsers.ana);
    await page.goto(material(demoMaterials.hiddenNotes));
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
  });

  test("a trainer previews any course and sees what is still hidden", async ({ page }) => {
    await signInAs(page, demoUsers.trainer);
    await page.goto(classroom);
    await expect(page.getByText("Está a ver este curso como um formando.")).toBeVisible();
    const hidden = page.getByRole("listitem").filter({ hasText: "Notas do formador (rascunho)" });
    await expect(hidden.getByText("Oculto")).toBeVisible();

    await page.goto(`/pt/learn/courses/${demoCourses.draft.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "IA para direções escolares" }),
    ).toBeVisible();
  });
});

test.describe("account", () => {
  test("a person changes their name, language and password", async ({ page }) => {
    const email = uniqueEmail("conta");
    const { data, error } = await admin().auth.admin.createUser({
      email,
      password: "demo-password-123",
      email_confirm: true,
      user_metadata: { full_name: "Nome Antigo", locale: "pt" },
    });
    expect(error).toBeNull();
    try {
      await signInAs(page, { email });
      await page.getByRole("button", { name: "Conta" }).click();
      await page.getByRole("link", { name: "A minha conta" }).click();
      await expect(page).toHaveURL(/\/pt\/learn\/account$/);
      await expect(field(page, "Email")).toBeDisabled();

      // Name
      await field(page, "Nome").fill("Nome Novo");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Alterações guardadas." }),
      ).toBeVisible();

      // Language: the page comes back in English, and the choice is stored.
      await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page).toHaveURL(/\/en\/learn\/account$/);
      await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
      const { data: profile } = await admin()
        .from("profiles")
        .select("full_name, locale")
        .eq("id", data.user!.id)
        .single();
      expect(profile).toEqual({ full_name: "Nome Novo", locale: "en" });

      // Password: the current one is needed, and the two new ones must match.
      await field(page, "Current password").fill("not-the-password-1");
      await field(page, "New password").fill("another-password-456");
      await field(page, "Repeat the new password").fill("another-password-456");
      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByText("The current password is not correct.")).toBeVisible();

      await field(page, "Current password").fill("demo-password-123");
      await field(page, "New password").fill("another-password-456");
      await field(page, "Repeat the new password").fill("another-password-457");
      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByText("As palavras-passe não coincidem.")).toHaveCount(0);
      await expect(page.getByText("The passwords do not match.")).toBeVisible();

      await field(page, "Current password").fill("demo-password-123");
      await field(page, "New password").fill("another-password-456");
      await field(page, "Repeat the new password").fill("another-password-456");
      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();
      await expect(field(page, "Current password")).toHaveValue("");

      // Sign out, and the new password is the one that works.
      await signOut(page, "en");
      await expect(page).toHaveURL(/\/en$/);
      await signIn(page, email, "another-password-456", "en");
      await expect(page).toHaveURL(/\/en\/learn$/);
      await expect(page.getByText("Hello, Nome Novo")).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
