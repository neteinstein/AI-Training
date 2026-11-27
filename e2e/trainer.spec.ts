import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  alertWith,
  confirmation,
  demoCourses,
  demoUsers,
  expectNotice,
  field,
  fillBoth,
  signIn,
  signInAsTrainer,
  unique,
} from "./helpers";

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

test.describe("areas: a save that is refused", () => {
  test("the colour and the icon chosen before it are the ones saved after it", async ({ page }) => {
    const name = unique("Arquitetos");
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/areas/new");
      // Chosen first; then the save is refused, because the name is missing.
      await page.locator("label").filter({ hasText: "Rosa" }).click();
      await page.getByTitle("Balança").click();
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(alertWith(page, "Verifique os campos assinalados.")).toBeVisible();
      // The form still holds the choice, and does not merely show it: a form is reset when
      // its handler has run, which once put these two back to where they started while the
      // screen went on showing what had been chosen.
      await expect(page.getByRole("radio", { name: "Rosa" })).toBeChecked();
      await expect(page.getByRole("radio", { name: "Balança" })).toBeChecked();

      await fillBoth(page, "Nome", name, `${name} EN`);
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Área criada.");
      const { data: saved } = await admin()
        .from("areas")
        .select("color, icon")
        .eq("name_pt", name)
        .single();
      expect(saved).toEqual({ color: "rose", icon: "scale" });
    } finally {
      await admin().from("areas").delete().like("name_pt", "Arquitetos %");
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
    // The six demo courses come first; a course another test is working on would follow them.
    const rows = page.getByRole("list", { name: "Cursos" }).locator("> li");
    await expect(rows.nth(5)).toBeVisible();
    await expect(rows.nth(0)).toContainText("IA na sala de aula");
    await expect(rows.nth(0)).toContainText("Publicado");
    await expect(rows.nth(0)).toContainText("1 formando");
    await expect(rows.nth(4)).toContainText("IA para direções escolares");
    await expect(rows.nth(4)).toContainText("Rascunho");
    await expect(rows.nth(5)).toContainText("Não listado");
  });

  test("a new course goes from draft to the public site, and off it again", async ({ page }) => {
    const title = unique("Curso novo");
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/courses");
      await page.getByRole("link", { name: "Novo curso" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Novo curso" })).toBeVisible();

      // The area, the level, the date and the place are required.
      await fillBoth(page, "Título", title, `${title} EN`);
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(alertWith(page, "Verifique os campos assinalados.")).toBeVisible();
      await expect(page.getByText("Escolha uma opção.").filter({ visible: true })).toHaveCount(2);
      await expect(page.getByText("Preencha este campo.").filter({ visible: true })).toHaveCount(2);

      await field(page, "Área").selectOption({ label: "Médicos" });
      await field(page, "Nível").selectOption({ label: "Avançado" });
      await field(page, "Data").fill("2027-03-06");
      await field(page, "Local").fill("Porto");
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/courses\/[0-9a-f-]{36}\/content$/);
      await expectNotice(page, "Curso criado. Pode agora adicionar o conteúdo.");
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      const courseUrl = page.url().replace(/\/content$/, "");

      // A draft is not on the public site, and cannot be published without its summaries.
      const status = page.getByRole("combobox", { name: "Estado" });
      await expect(status).toHaveValue("draft");
      await status.selectOption("published");
      await page.getByRole("button", { name: "Alterar estado" }).click();
      await expect(alertWith(page, "preencha primeiro o resumo nos dois idiomas")).toBeVisible();
      await page.getByRole("button", { name: "Fechar mensagem" }).click();

      await page.getByRole("link", { name: "Detalhes", exact: true }).click();
      await fillBoth(page, "Resumo", "Resumo para o público.", "Summary for the public.");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(confirmation(page, "Alterações guardadas.")).toBeVisible();

      await page.getByRole("combobox", { name: "Estado" }).selectOption("published");
      await page.getByRole("button", { name: "Alterar estado" }).click();
      await expectNotice(page, "Estado alterado.");

      // The public catalogue shows it at once, in both languages.
      await page.goto("/pt/courses");
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await page.goto("/en/courses");
      await expect(page.getByRole("heading", { name: `${title} EN`, exact: true })).toBeVisible();

      // Unlisted: off the public site again.
      await page.goto(courseUrl);
      await page.getByRole("combobox", { name: "Estado" }).selectOption("unlisted");
      await page.getByRole("button", { name: "Alterar estado" }).click();
      await expectNotice(page, "Estado alterado.");
      await page.goto("/pt/courses");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);

      // Deleting asks first, then leads back to the list.
      await page.goto(courseUrl);
      await page.getByRole("button", { name: "Eliminar curso" }).click();
      await expect(page.getByRole("alertdialog")).toContainText(`Eliminar o curso «${title}»?`);
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/courses$/);
      await expectNotice(page, "Curso eliminado.");
      await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    } finally {
      await admin().from("courses").delete().like("title_pt", "Curso novo %");
    }
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
      await field(page, "Data").fill("2027-10-09");
      await field(page, "Local").fill("  Online  ");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(confirmation(page, "Alterações guardadas.")).toBeVisible();

      await page.reload();
      await expect(field(page, "Duração em horas (opcional)")).toHaveValue("7,5");
      await expect(field(page, "Data")).toHaveValue("2027-10-09");
      await expect(field(page, "Local")).toHaveValue("Online");
      const { data: after } = await service.from("courses").select("*").eq("id", id).single();
      expect(after?.summary_pt).toBe("Resumo de teste.");
      expect(after?.summary_en).toBe("Test summary.");
      expect(after?.duration_hours).toBe(7.5);
      expect(after?.starts_on).toBe("2027-10-09");
      expect(after?.location).toBe("Online");

      // A number that is not a duration is refused, with the reason.
      await field(page, "Duração em horas (opcional)").fill("muitas");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Indique as horas com um número entre 0,5 e 999")).toBeVisible();

      // The place cannot be emptied.
      await field(page, "Duração em horas (opcional)").fill("7,5");
      await field(page, "Local").fill(" ");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Preencha este campo.").filter({ visible: true })).toHaveCount(1);
    } finally {
      if (before) {
        await service
          .from("courses")
          .update({
            summary_pt: before.summary_pt,
            summary_en: before.summary_en,
            duration_hours: before.duration_hours,
            starts_on: before.starts_on,
            location: before.location,
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
