import { expect, test, type Page } from "@playwright/test";
import { buildSamplePdf } from "../tests/fixtures/sample-pdf";
import {
  admin,
  alertWith,
  BUCKET,
  expectNotice,
  field,
  fillBoth,
  freshCourse,
  signInAsTrainer,
} from "./helpers";

const moduleCard = (page: Page, number: number) =>
  page.getByRole("region", { name: new RegExp(`^Módulo ${number}\\. `) });

/** The titles of the materials of a module, in the order shown. */
const materialTitles = (page: Page, number: number) =>
  moduleCard(page, number).locator("ul > li > span.flex-col > a");

/** Opens a row's "more actions" menu and chooses one entry. */
async function chooseFromMenu(page: Page, row: string, entry: string | RegExp) {
  await page.getByRole("button", { name: `Mais ações: ${row}` }).click();
  await page.getByRole("menuitem", { name: entry }).click();
}

/** The file field of the page on screen (the page before it stays in the document, hidden). */
const filePicker = (page: Page) => page.locator('input[type="file"]').filter({ visible: true });

async function addMaterial(page: Page, module: number, kind: string, heading: string) {
  await moduleCard(page, module).getByRole("link", { name: kind, exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
}

test.describe("course builder", () => {
  test("modules and every kind of material: create, order, show, move and delete", async ({
    page,
  }) => {
    const course = await freshCourse("Construtor");
    try {
      await signInAsTrainer(page);
      await page.goto(course.content);
      await expect(page.getByRole("heading", { level: 1, name: course.title })).toBeVisible();
      await expect(page.getByText("Este curso ainda não tem conteúdo.")).toBeVisible();

      // A module needs a title in one language at least.
      await page.getByRole("link", { name: "Adicionar módulo" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Novo módulo" })).toBeVisible();
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(
        page.getByText("Preencha este campo em pelo menos um dos idiomas."),
      ).toBeVisible();
      await fillBoth(page, "Título do módulo", "Módulo um", "");
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Módulo criado.");
      await expect(page.getByRole("heading", { level: 2, name: "1. Módulo um" })).toBeVisible();
      await expect(moduleCard(page, 1)).toContainText("Ainda sem materiais");

      // A text page, written in Markdown and checked in the preview.
      await addMaterial(page, 1, "Página", "Nova página");
      await expect(page.getByText("No módulo «1. Módulo um»")).toBeVisible();
      await fillBoth(page, "Título", "Guia rápido", "");
      await field(page, "Texto: Português").fill(
        "## Como pedir\n\nSeja **claro**.\n\n```prompt\nEscreve um plano de aula.\n```",
      );
      await page.getByRole("button", { name: "Pré-visualizar" }).click();
      const preview = page.getByRole("region", { name: "Pré-visualização em Português" });
      await expect(preview.getByRole("heading", { name: "Como pedir" })).toBeVisible();
      await expect(preview.getByRole("button", { name: "Copiar" })).toBeVisible();
      await page.getByRole("button", { name: "Escrever" }).click();
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");

      // A video: only addresses the platform can show are accepted.
      await addMaterial(page, 1, "Vídeo", "Novo vídeo");
      await field(page, "Ligação do vídeo").fill("https://example.org/um-video");
      await fillBoth(page, "Título", "", "First steps");
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(alertWith(page, "Verifique os campos assinalados.")).toBeVisible();
      await expect(field(page, "Ligação do vídeo")).toHaveAttribute("aria-invalid", "true");
      await field(page, "Ligação do vídeo").fill("https://youtu.be/aqz-KE-bpKQ");
      await field(page, "Idioma do conteúdo").selectOption("en");
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");

      await addMaterial(page, 1, "Documento Google", "Novo documento Google");
      await field(page, "Ligação do documento").fill(
        "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG/edit",
      );
      await fillBoth(page, "Título", "Apresentação", "Slides");
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");

      // A link, hidden for now.
      await addMaterial(page, 1, "Ligação", "Nova ligação");
      await field(page, "Endereço").fill("https://example.org/leitura");
      await fillBoth(page, "Título", "Leitura", "Reading");
      await page.getByRole("checkbox", { name: /Visível para os formandos/ }).uncheck();
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");

      const first = moduleCard(page, 1);
      await expect(materialTitles(page, 1)).toHaveText([
        "Guia rápido",
        "First steps",
        "Apresentação",
        "Leitura",
      ]);
      await expect(first).toContainText("4 materiais · 3 visíveis");
      await expect(first.getByText("Vídeo · YouTube")).toBeVisible();
      await expect(first.getByText("Google Slides")).toBeVisible();
      await expect(first.getByText("Ligação externa")).toBeVisible();
      await expect(first.getByText("Falta PT")).toBeVisible();

      // Visibility: one switch, then everything at once.
      const linkSwitch = page.getByRole("switch", { name: "Visível para os formandos: Leitura" });
      await expect(linkSwitch).not.toBeChecked();
      const guideSwitch = page.getByRole("switch", {
        name: "Visível para os formandos: Guia rápido",
      });
      await guideSwitch.click();
      await expect(guideSwitch).not.toBeChecked();
      await expect(first).toContainText("4 materiais · 2 visíveis");
      await first.getByRole("button", { name: /^Tornar tudo visível/ }).click();
      await expectNotice(page, "2 materiais ficaram visíveis.");
      await expect(linkSwitch).toBeChecked();
      await expect(guideSwitch).toBeChecked();
      await expect(first.getByRole("button", { name: /^Tornar tudo visível/ })).toHaveCount(0);

      // Order within the module.
      await page.getByRole("button", { name: "Mover Leitura para cima" }).click();
      await expect(materialTitles(page, 1)).toHaveText([
        "Guia rápido",
        "First steps",
        "Leitura",
        "Apresentação",
      ]);

      // A second module; a material moves into it; then the modules swap places.
      await page.getByRole("link", { name: "Adicionar módulo" }).click();
      await fillBoth(page, "Título do módulo", "Módulo dois", "Module two");
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Módulo criado.");
      await expect(page.getByRole("heading", { level: 2, name: "2. Módulo dois" })).toBeVisible();

      await chooseFromMenu(page, "Guia rápido", "2. Módulo dois");
      await expectNotice(page, "Material movido para «Módulo dois».");
      await expect(materialTitles(page, 1)).toHaveText(["First steps", "Leitura", "Apresentação"]);
      await expect(materialTitles(page, 2)).toHaveText(["Guia rápido"]);

      await page.getByRole("button", { name: "Mover Módulo dois para cima" }).click();
      await expect(page.getByRole("heading", { level: 2 })).toHaveText([
        "1. Módulo dois",
        "2. Módulo um",
      ]);

      // Editing keeps what was there; deleting asks first.
      await chooseFromMenu(page, "Leitura", "Editar");
      await expect(page.getByRole("heading", { level: 2, name: "Editar ligação" })).toBeVisible();
      await expect(field(page, "Endereço")).toHaveValue("https://example.org/leitura");
      await fillBoth(page, "Título", "Leitura recomendada", "Reading");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expectNotice(page, "Material guardado.");
      await expect(materialTitles(page, 2)).toHaveText([
        "First steps",
        "Leitura recomendada",
        "Apresentação",
      ]);

      await chooseFromMenu(page, "Apresentação", "Eliminar");
      await expect(page.getByRole("alertdialog")).toContainText("Eliminar «Apresentação»?");
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expectNotice(page, "Material eliminado.");
      await expect(materialTitles(page, 2)).toHaveText(["First steps", "Leitura recomendada"]);

      // What a learner would see follows the builder.
      await page.goto(`/pt/learn/courses/${course.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: course.title })).toBeVisible();
      // The first module is open; the second is folded, with its materials inside.
      await expect(page.getByText("Guia rápido")).toBeVisible();
      await expect(page.getByText("Leitura recomendada")).toHaveCount(1);
      await expect(page.getByText("Apresentação")).toHaveCount(0);

      await page.goto(course.content);
      await chooseFromMenu(page, "Módulo um", "Eliminar módulo");
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expectNotice(page, "Módulo eliminado.");
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(["1. Módulo dois"]);
    } finally {
      await course.remove();
    }
  });

  test("a file goes straight from the browser to storage and becomes a material", async ({
    page,
  }) => {
    const course = await freshCourse("Ficheiros");
    const service = admin();
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    try {
      const moduleId = await course.addModule("Sessões");
      await signInAsTrainer(page);
      await page.goto(course.content);
      await addMaterial(page, 1, "Ficheiro", "Novo ficheiro");

      // Saving without a file, and a type that is not accepted.
      await fillBoth(page, "Título", "Sem ficheiro", "");
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page.getByText("Escolha um ficheiro.")).toBeVisible();
      const picker = filePicker(page);
      await picker.setInputFiles({
        name: "programa.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("MZ"),
      });
      await expect(page.getByText("Este tipo de ficheiro não é aceite.")).toBeVisible();

      await fillBoth(page, "Título", "", "");
      await picker.setInputFiles({
        name: "Sessão 2.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(buildSamplePdf(2, "Sessao 2")),
      });
      await expect(page.getByText(/Ficheiro carregado: Sessão 2\.pdf/).first()).toBeVisible();
      // The file's name is proposed as the title.
      await expect(field(page, "Título: Português")).toHaveValue("Sessão 2");
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");
      await expect(materialTitles(page, 1)).toHaveText(["Sessão 2"]);
      await expect(moduleCard(page, 1).getByText(/^PDF · /)).toBeVisible();

      const { data: created } = await service
        .from("materials")
        .select("id, storage_path, file_name, mime_type, size_bytes")
        .eq("module_id", moduleId)
        .single();
      expect(created).toMatchObject({ file_name: "Sessão 2.pdf", mime_type: "application/pdf" });
      expect(created!.storage_path).toMatch(new RegExp(`^${course.id}/[0-9a-f-]{36}\\.pdf$`));

      const download = await page.request.get(`/api/materials/${created!.id}/download`);
      expect(download.status()).toBe(200);
      expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");

      // Replacing the file keeps the material and removes the old file.
      await moduleCard(page, 1).getByRole("link", { name: "Sessão 2", exact: true }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Editar ficheiro" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Sessão 2.pdf" })).toBeVisible();
      await filePicker(page).setInputFiles({
        name: "Sessão 2 (corrigida).pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(buildSamplePdf(4, "Sessao 2 corrigida")),
      });
      await expect(
        page.getByText(/Ficheiro carregado: Sessão 2 \(corrigida\)\.pdf/).first(),
      ).toBeVisible();
      await page.getByRole("button", { name: "Guardar" }).click();
      await expectNotice(page, "Material guardado.");

      const { data: replaced } = await service
        .from("materials")
        .select("id, storage_path, file_name")
        .eq("module_id", moduleId)
        .single();
      expect(replaced!.id).toBe(created!.id);
      expect(replaced!.file_name).toBe("Sessão 2 (corrigida).pdf");
      expect(replaced!.storage_path).not.toBe(created!.storage_path);
      const old = await service.storage.from(BUCKET).info(created!.storage_path!);
      expect(old.error).not.toBeNull();

      // Nothing the upload needs is blocked by the page's security policy.
      expect(problems.filter((text) => /content security policy/i.test(text))).toEqual([]);
    } finally {
      await course.remove();
    }
  });
});
