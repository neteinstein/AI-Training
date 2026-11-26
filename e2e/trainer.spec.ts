import { expect, test, type Page } from "@playwright/test";
import { admin, alertWith, demoCourses, demoUsers, field, signIn } from "./helpers";

/** A name no other test or run uses. The slug made from it is unique too. */
const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function signInAsTrainer(page: Page) {
  await signIn(page, demoUsers.trainer.email);
  await expect(page).toHaveURL(/\/pt\/trainer$/);
}

/** The message shown after an action that worked. */
const confirmation = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

/**
 * Checks the message that pops up after an action, and closes it: on a phone it sits over the
 * bottom of the page for a few seconds, where the next button to press may be.
 */
async function expectNotice(page: Page, text: string) {
  const notice = confirmation(page, text);
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Fechar mensagem" }).click();
  await expect(notice).toHaveCount(0);
}

/**
 * Fills a text that exists in both languages. Wide screens show the two side by side; a phone
 * shows one at a time, behind a switch.
 */
async function fillBoth(page: Page, label: string, pt: string, en: string) {
  // The form may still be arriving: wait for the field before asking how it is shown.
  await expect(
    page.getByRole("group", { name: new RegExp(`^${label}`) }).filter({ visible: true }),
  ).toBeVisible();
  for (const [language, value] of [
    ["Português", pt],
    ["Inglês", en],
  ] as const) {
    const input = field(page, `${label}: ${language}`);
    if (!(await input.isVisible())) {
      await page.getByRole("button", { name: language }).filter({ visible: true }).click();
    }
    await input.fill(value);
  }
}

const rowNames = (page: Page, list: string) =>
  page.getByRole("list", { name: list }).locator("> li > span.flex-col > span:first-child");

test.describe("back-office frame", () => {
  test("the dashboard gives the numbers and the menu reaches every section", async ({
    page,
    isMobile,
  }) => {
    await signInAsTrainer(page);
    await expect(page.getByRole("heading", { level: 1, name: "Painel" })).toBeVisible();
    await expect(page.getByText("Olá, Formador Demo")).toBeVisible();
    await expect(page.getByRole("link", { name: /Cursos publicados/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Formandos ativos/ })).toBeVisible();

    if (isMobile) await page.getByRole("button", { name: "Abrir menu" }).click();
    const menu = isMobile ? page.getByRole("dialog") : page.getByRole("complementary");
    for (const name of ["Painel", "Cursos", "Áreas", "Níveis", "Utilizadores", "Pedidos"]) {
      await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await menu.getByRole("link", { name: "Áreas", exact: true }).click();
    await expect(page).toHaveURL(/\/pt\/trainer\/areas$/);
    await expect(page.getByRole("heading", { level: 1, name: "Áreas" })).toBeVisible();
  });

  test("a learner cannot open the back-office", async ({ page }) => {
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    for (const path of ["/pt/trainer", "/pt/trainer/areas", "/pt/trainer/courses/new"]) {
      await page.goto(path);
      // The same answer as for an address that does not exist, with nothing of the back-office.
      await expect(
        page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Utilizadores" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /Painel|Áreas|Novo curso/ })).toHaveCount(0);
    }
  });
});

test.describe("areas", () => {
  test("a trainer creates, reorders, edits and deletes areas", async ({ page }) => {
    const first = unique("Juristas");
    const second = unique("Engenheiros");
    const renamed = `${second} (novo)`;
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/areas");

      // Nothing is saved until the required texts are there, in both languages.
      await page.getByRole("link", { name: "Nova área" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Nova área" })).toBeVisible();
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(alertWith(page, "Verifique os campos assinalados.")).toBeVisible();
      await expect(
        page.getByText("Preencha este campo.").filter({ visible: true }),
      ).not.toHaveCount(0);

      await fillBoth(page, "Nome", first, `${first} EN`);
      await page.locator("label").filter({ hasText: "Rosa" }).click();
      await page.getByTitle("Balança").click();
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/areas$/);
      await expectNotice(page, "Área criada.");

      await page.getByRole("link", { name: "Nova área" }).click();
      await fillBoth(page, "Nome", second, `${second} EN`);
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Área criada.");

      // New areas go to the end, in the order they were made.
      const names = rowNames(page, "Áreas");
      await expect(names).toHaveText(["Professores", "Médicos", first, second]);

      // Moving keeps the keyboard where it was, and says so to screen readers.
      await page.getByRole("button", { name: `Mover ${second} para cima` }).click();
      await expect(names).toHaveText(["Professores", "Médicos", second, first]);
      await expect(page.getByRole("status").filter({ hasText: "Ordem atualizada." })).toHaveCount(
        1,
      );
      await expect(page.getByRole("button", { name: `Mover ${second} para cima` })).toBeFocused();
      await expect(page.getByRole("button", { name: `Mover ${first} para baixo` })).toHaveAttribute(
        "aria-disabled",
        "true",
      );

      await page.getByRole("link", { name: `Editar ${second}` }).click();
      await expect(field(page, "Endereço (opcional)")).toHaveValue(/^engenheiros-/);
      await fillBoth(page, "Nome", renamed, `${second} EN`);
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/areas$/);
      await expectNotice(page, "Alterações guardadas.");
      await expect(names).toHaveText(["Professores", "Médicos", renamed, first]);

      // Deleting asks first, and an area that still has courses is kept.
      await page.getByRole("button", { name: `Eliminar ${first}` }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(`Eliminar a área «${first}»?`);
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(names).toHaveText(["Professores", "Médicos", renamed, first]);

      await page.getByRole("button", { name: `Eliminar ${first}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expectNotice(page, "Área eliminada.");
      await expect(names).toHaveText(["Professores", "Médicos", renamed]);

      await page.getByRole("button", { name: "Eliminar Professores" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(alertWith(page, "Esta área ainda tem cursos.")).toBeVisible();
      await page.getByRole("button", { name: "Fechar mensagem" }).click();

      await page.getByRole("button", { name: `Eliminar ${renamed}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(names).toHaveText(["Professores", "Médicos"]);
    } finally {
      await admin().from("areas").delete().like("name_pt", "Juristas %");
      await admin().from("areas").delete().like("name_pt", "Engenheiros %");
    }
  });
});

test.describe("levels", () => {
  test("a trainer creates a level with its own address, and addresses stay unique", async ({
    page,
  }) => {
    const name = unique("Especialista");
    const slug = `especialista-${Date.now().toString(36)}`;
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/levels");
      await expect(rowNames(page, "Níveis")).toHaveText(["Iniciação", "Avançado"]);

      await page.getByRole("link", { name: "Novo nível" }).click();
      await fillBoth(page, "Nome", name, `${name} EN`);
      await field(page, "Endereço (opcional)").fill("Não é um endereço!");
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page.getByText("Use apenas letras minúsculas sem acentos")).toBeVisible();
      // What was typed is still there.
      await expect(
        field(page, "Nome: Português").or(field(page, "Nome: Inglês")).first(),
      ).toHaveValue(new RegExp(name));

      await field(page, "Endereço (opcional)").fill(slug);
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Nível criado.");
      await expect(rowNames(page, "Níveis")).toHaveText(["Iniciação", "Avançado", name]);

      await page.getByRole("link", { name: "Novo nível" }).click();
      await fillBoth(page, "Nome", `${name} bis`, `${name} bis EN`);
      await field(page, "Endereço (opcional)").fill(slug);
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page.getByText("Já existe um nível com este endereço.")).toBeVisible();
      await page.getByRole("link", { name: "Cancelar" }).click();

      await page.getByRole("button", { name: `Eliminar ${name}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expectNotice(page, "Nível eliminado.");
      await expect(rowNames(page, "Níveis")).toHaveText(["Iniciação", "Avançado"]);
    } finally {
      await admin().from("levels").delete().like("name_pt", "Especialista %");
    }
  });
});

test.describe("course details", () => {
  test("the list shows every course with its status, in the order of the public site", async ({
    page,
  }) => {
    await signInAsTrainer(page);
    await page.goto("/pt/trainer/courses");
    const rows = page.getByRole("list", { name: "Cursos" }).locator("> li");
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(0)).toContainText("IA na sala de aula");
    await expect(rows.nth(0)).toContainText("Publicado");
    await expect(rows.nth(0)).toContainText("1 formando");
    await expect(rows.nth(4)).toContainText("IA para direções escolares");
    await expect(rows.nth(4)).toContainText("Rascunho");
    await expect(rows.nth(5)).toContainText("Não listado");
  });

  test("details are edited in both languages and survive a reload", async ({ page }) => {
    const service = admin();
    const id = demoCourses.draft.id;
    const { data: before } = await service.from("courses").select("*").eq("id", id).single();
    try {
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${id}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "IA para direções escolares" }),
      ).toBeVisible();

      await fillBoth(page, "Resumo", "Resumo de teste.", "Test summary.");
      await field(page, "Duração em horas (opcional)").fill("7,5");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(confirmation(page, "Alterações guardadas.")).toBeVisible();

      await page.reload();
      await expect(field(page, "Duração em horas (opcional)")).toHaveValue("7,5");
      const { data: after } = await service.from("courses").select("*").eq("id", id).single();
      expect(after?.summary_pt).toBe("Resumo de teste.");
      expect(after?.summary_en).toBe("Test summary.");
      expect(after?.duration_hours).toBe(7.5);

      // A number that is not a duration is refused, with the reason.
      await field(page, "Duração em horas (opcional)").fill("muitas");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Indique as horas com um número entre 0,5 e 999")).toBeVisible();
    } finally {
      if (before) {
        await service
          .from("courses")
          .update({
            summary_pt: before.summary_pt,
            summary_en: before.summary_en,
            duration_hours: before.duration_hours,
          })
          .eq("id", id);
      }
    }
  });

  test("a course without both summaries cannot leave draft", async ({ page }) => {
    const service = admin();
    const id = demoCourses.draft.id;
    const { data: before } = await service.from("courses").select("*").eq("id", id).single();
    try {
      await service.from("courses").update({ summary_en: null }).eq("id", id);
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${id}`);

      const status = page.getByRole("combobox", { name: "Estado" });
      await expect(status).toHaveValue("draft");
      await status.selectOption("published");
      await page.getByRole("button", { name: "Alterar estado" }).click();
      await expect(alertWith(page, "preencha primeiro o resumo nos dois idiomas")).toBeVisible();
      const { data: still } = await service.from("courses").select("status").eq("id", id).single();
      expect(still?.status).toBe("draft");
    } finally {
      if (before) {
        await service
          .from("courses")
          .update({ summary_en: before.summary_en, status: "draft" })
          .eq("id", id);
      }
    }
  });
});
