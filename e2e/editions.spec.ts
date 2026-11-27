import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  alertWith,
  deleteUserByEmail,
  demoCourses,
  demoEditions,
  demoMaterials,
  demoUsers,
  expectNotice,
  field,
  fillBoth,
  freshCourse,
  signIn,
  signInAsTrainer,
  uniqueEmail,
} from "./helpers";

/**
 * Editions: the runs of a course, each with its own learners and its own view of the content.
 * The demo course "IA na sala de aula" has two: the general one (Ana is in it) and a dated,
 * public "Turma presencial" with a page of its own and one of the course's materials hidden.
 */

const classroom = demoCourses.classroom;

/** Opens a row's "more actions" menu and chooses one entry. */
async function chooseFromMenu(page: Page, row: string, entry: string | RegExp) {
  await page.getByRole("button", { name: `Mais ações: ${row}` }).click();
  await page.getByRole("menuitem", { name: entry }).click();
}

/** A second edition for a course made by `freshCourse`, without dates. */
async function addEdition(courseId: string, name: string): Promise<string> {
  const { data, error } = await admin()
    .from("editions")
    .insert({ course_id: courseId, name_pt: name, name_en: `${name} EN` })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create the edition: ${error?.message}`);
  return data.id;
}

test.describe("editions of a course", () => {
  test("a trainer creates an edition, makes it the default and deletes it", async ({ page }) => {
    const course = await freshCourse("Edições");
    try {
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${course.id}/content`);
      await page.getByRole("link", { name: "Edições", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/courses/${course.id}/editions$`));

      // Every course starts with one edition, where new learners go.
      const list = page.getByRole("list", { name: "Edições do curso" });
      const row = (name: string) => list.getByRole("listitem").filter({ hasText: name });
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(row("Edição geral").getByText("Predefinida", { exact: true })).toBeVisible();
      await expect(row("Edição geral")).toContainText("Sem datas");

      await page.getByRole("link", { name: "Nova edição" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Nova edição" })).toBeVisible();

      // The name is needed in both languages; a public edition needs a first day; and the
      // last day cannot come before the first.
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page.getByText("Preencha este campo.").first()).toBeVisible();
      await fillBoth(page, "Nome da edição", "Turma de teste", "Test class");
      await page.getByRole("checkbox", { name: /Mostrar na página pública do curso/ }).check();
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(
        page.getByText("Indique o primeiro dia para mostrar a edição no site público."),
      ).toBeVisible();
      await field(page, "Primeiro dia (opcional)").fill("2099-03-10");
      await field(page, "Último dia (opcional)").fill("2099-03-01");
      await page.getByRole("button", { name: "Criar" }).click();
      await expect(page.getByText("O último dia não pode ser anterior ao primeiro.")).toBeVisible();
      // What was typed is still there.
      await expect(field(page, "Primeiro dia (opcional)")).toHaveValue("2099-03-10");
      await field(page, "Último dia (opcional)").fill("2099-03-20");
      await page.getByRole("button", { name: "Criar" }).click();

      await expectNotice(page, "Edição criada.");
      await expect(page).toHaveURL(new RegExp(`/courses/${course.id}/editions$`));
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await expect(row("Turma de teste")).toContainText("2099");
      await expect(row("Turma de teste")).toContainText("Sem formandos");
      await expect(row("Turma de teste").getByText("No site público")).toBeVisible();

      // Editing keeps what was saved.
      await row("Turma de teste").getByRole("link", { name: "Turma de teste" }).click();
      await expect(page.getByRole("heading", { level: 2, name: "Editar edição" })).toBeVisible();
      await expect(field(page, "Primeiro dia (opcional)")).toHaveValue("2099-03-10");
      await expect(
        page.getByRole("checkbox", { name: /Mostrar na página pública do curso/ }),
      ).toBeChecked();
      await fillBoth(page, "Nome da edição", "Turma de março", "March class");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expectNotice(page, "Alterações guardadas.");
      await expect(row("Turma de março")).toBeVisible();

      await chooseFromMenu(page, "Turma de março", "Tornar predefinida");
      await expectNotice(page, "Edição predefinida alterada.");
      await expect(row("Turma de março").getByText("Predefinida", { exact: true })).toBeVisible();
      await expect(row("Edição geral").getByText("Predefinida", { exact: true })).toHaveCount(0);

      // Deleting asks first. The default passes to the edition that is left, and that one,
      // being the last, cannot be deleted.
      await chooseFromMenu(page, "Turma de março", "Eliminar edição");
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Eliminar a edição «Turma de março»?");
      await dialog.getByRole("button", { name: "Sim, eliminar" }).click();
      await expectNotice(page, "Edição eliminada.");
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(row("Edição geral").getByText("Predefinida", { exact: true })).toBeVisible();

      await chooseFromMenu(page, "Edição geral", "Eliminar edição");
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(alertWith(page, "Um curso tem sempre pelo menos uma edição.")).toBeVisible();
      await expect(list.getByRole("listitem")).toHaveCount(1);
    } finally {
      await course.remove();
    }
  });

  test("learners are listed by edition, join the one chosen, and can be moved", async ({
    page,
  }) => {
    const course = await freshCourse("Turmas");
    try {
      await addEdition(course.id, "Turma B");
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${course.id}/learners`);

      // Adding people now asks which edition; the default one is proposed.
      const edition = page.getByRole("combobox", { name: "Edição" });
      await expect(edition.locator("option:checked")).toHaveText("Edição geral");
      await edition.selectOption({ label: "Turma B" });
      await page.getByRole("checkbox", { name: /John Smith/ }).check();
      await page.getByRole("button", { name: "Adicionar ao curso" }).click();
      await expectNotice(page, "1 pessoa adicionada.");

      const general = page.getByRole("list", { name: "Edição geral" });
      const classB = page.getByRole("list", { name: "Turma B" });
      await expect(classB.getByRole("link")).toHaveText(["John Smith"]);
      await expect(general).toHaveCount(0);
      await expect(page.getByText("Ainda ninguém nesta edição.")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Formandos (1)" })).toBeVisible();

      await chooseFromMenu(page, "John Smith", "Edição geral");
      await expectNotice(page, "Pessoa movida para «Edição geral».");
      await expect(general.getByRole("link")).toHaveText(["John Smith"]);
      await expect(classB).toHaveCount(0);

      // An edition with people in it is kept.
      await page.getByRole("link", { name: "Edições", exact: true }).click();
      await chooseFromMenu(page, "Edição geral", "Eliminar edição");
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(alertWith(page, "Esta edição tem formandos.")).toBeVisible();
      await page.getByRole("button", { name: "Fechar mensagem" }).click();

      await page.getByRole("link", { name: /^Formandos/ }).click();
      await chooseFromMenu(page, "John Smith", "Retirar");
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Retirar John Smith deste curso?");
      await dialog.getByRole("button", { name: "Sim, retirar" }).click();
      await expectNotice(page, "Pessoa retirada do curso.");
      await expect(page.getByText("Ainda ninguém está inscrito neste curso.")).toBeVisible();
    } finally {
      await course.remove();
    }
  });

  test("what an edition shows is set in the content tab, and its learners get exactly that", async ({
    page,
  }) => {
    const course = await freshCourse("Por edição");
    const service = admin();
    try {
      const classB = await addEdition(course.id, "Turma B");
      const moduleId = await course.addModule("Módulo um");
      const pages = await service.from("materials").insert(
        ["Página um", "Página dois"].map((title_pt, index) => ({
          module_id: moduleId,
          kind: "page" as const,
          title_pt,
          body_pt: "Texto",
          is_published: true,
          sort_order: (index + 1) * 10,
        })),
      );
      expect(pages.error).toBeNull();
      // Open to its learners (a draft is not), and Ana joins the second edition.
      const opened = await service
        .from("courses")
        .update({ status: "unlisted", summary_pt: "Resumo", summary_en: "Summary" })
        .eq("id", course.id);
      expect(opened.error).toBeNull();
      const enrolled = await service
        .from("enrollments")
        .insert({ user_id: demoUsers.ana.id, course_id: course.id, edition_id: classB });
      expect(enrolled.error).toBeNull();

      await signInAsTrainer(page);
      await page.goto(course.content);
      const views = page.getByRole("navigation", { name: "Mostrar" });
      await expect(views.getByRole("link")).toHaveText(["Todo o curso", "Edição geral", "Turma B"]);
      await views.getByRole("link", { name: "Turma B" }).click();
      await expect(page).toHaveURL(new RegExp(`edition=${classB}`));
      await expect(page.getByText("Está a ver o que a edição «Turma B» mostra.")).toBeVisible();

      // One of the course's materials is hidden in this edition only.
      const shown = page.getByRole("switch", { name: "Visível nesta edição: Página um" });
      await expect(shown).toBeChecked();
      await shown.click();
      await expect(shown).not.toBeChecked();
      await expect
        .poll(async () => {
          const { data } = await service
            .from("edition_hidden_materials")
            .select("material_id")
            .eq("edition_id", classB);
          return data?.length;
        })
        .toBe(1);
      await page.reload();
      await expect(shown).not.toBeChecked();
      await expect(page.getByRole("region", { name: /^Módulo 1\. / })).toContainText(
        "2 materiais · 1 visível nesta edição",
      );

      // And it gets a page of its own: the form proposes this edition, and comes back here.
      await page
        .getByRole("group", { name: "Adicionar material a Módulo um" })
        .getByRole("link", { name: "Página", exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 2, name: "Nova página" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Quem vê este material" })).toHaveValue(
        classB,
      );
      await fillBoth(page, "Título", "Só para a turma B", "");
      await field(page, "Texto: Português").fill("Um texto só desta edição.");
      await page.getByRole("button", { name: "Criar" }).click();
      await expectNotice(page, "Material adicionado.");
      await expect(page).toHaveURL(new RegExp(`edition=${classB}`));
      const own = page.getByRole("listitem").filter({ hasText: "Só para a turma B" });
      await expect(own.getByText("Só nesta edição")).toBeVisible();

      // The whole course lists everything, and says what belongs where.
      await views.getByRole("link", { name: "Todo o curso" }).click();
      await expect(page.getByText("Está a ver o que a edição")).toHaveCount(0);
      await expect(
        page.getByRole("listitem").filter({ hasText: "Página um" }).getByText("Oculto em 1 edição"),
      ).toBeVisible();
      await expect(own.getByText("Só: Turma B")).toBeVisible();

      // "View as learner" from an edition's view shows what that edition gets.
      await views.getByRole("link", { name: "Turma B" }).click();
      await page.getByRole("link", { name: "Ver como formando" }).click();
      await expect(
        page.getByText("Está a ver este curso como um formando da edição «Turma B».", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(page.getByText("Página dois")).toBeVisible();
      await expect(page.getByText("Só para a turma B")).toBeVisible();
      await expect(page.getByText("Página um")).toHaveCount(0);
      // The other edition's view, one click away, has the hidden page and not the extra one.
      await page
        .getByRole("navigation", { name: "Ver o que cada edição vê" })
        .getByRole("link", { name: "Edição geral" })
        .click();
      await expect(page.getByText("Página um")).toBeVisible();
      await expect(page.getByText("Só para a turma B")).toHaveCount(0);

      // Ana, a learner of the second edition.
      await page.context().clearCookies();
      await signIn(page, demoUsers.ana.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await page.goto(`/pt/learn/courses/${course.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: course.title })).toBeVisible();
      await expect(page.getByText("Turma B", { exact: true })).toBeVisible();
      await expect(page.getByText("Página dois")).toBeVisible();
      await expect(page.getByText("Só para a turma B")).toBeVisible();
      await expect(page.getByText("Página um")).toHaveCount(0);
    } finally {
      await course.remove();
    }
  });

  test("the demo course: each edition's learners, the trainer's preview and the public page", async ({
    page,
  }) => {
    const course = `/pt/learn/courses/${classroom.slug}`;

    // The public page lists the coming editions that were marked as public.
    await page.goto(`/pt/courses/${classroom.slug}`);
    const join = page.getByRole("complementary", { name: "Participar neste curso" });
    await expect(join.getByRole("heading", { level: 3, name: "Próximas edições" })).toBeVisible();
    await expect(join.getByRole("listitem")).toHaveText([/^Turma presencial/]);
    await page.goto(`/en/courses/${classroom.slug}`);
    await expect(page.getByRole("heading", { level: 3, name: "Upcoming editions" })).toBeVisible();
    await expect(page.getByText("In-person class")).toBeVisible();
    await page.goto(`/pt/courses/${demoCourses.clinical.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Próximas edições")).toHaveCount(0);

    // Ana is in the general edition: she is told so, and gets neither the class's own page
    // nor a way into it.
    await signIn(page, demoUsers.ana.email);
    await expect(page).toHaveURL(/\/pt\/learn$/);
    await page.goto(course);
    await expect(page.getByText("Edição geral", { exact: true })).toBeVisible();
    await expect(page.getByText("Leitura recomendada")).toBeVisible();
    await expect(page.getByText("Horário das sessões")).toHaveCount(0);
    await page.goto(`${course}?edition=${demoEditions.classroomInPerson}`);
    await expect(page.getByText("Edição geral", { exact: true })).toBeVisible();
    await expect(page.getByText("Horário das sessões")).toHaveCount(0);
    await page.goto(`${course}/materials/${demoMaterials.timetable}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();

    // A trainer sees the whole course, and each edition's view on request.
    await page.context().clearCookies();
    await signInAsTrainer(page);
    await page.goto(course);
    const timetable = page.getByRole("listitem").filter({ hasText: "Horário das sessões" });
    await expect(timetable.getByText("Só: Turma presencial")).toBeVisible();
    await expect(page.getByText("Leitura recomendada")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Ver o que cada edição vê" })
      .getByRole("link", { name: "Turma presencial" })
      .click();
    await expect(
      page.getByText("Está a ver este curso como um formando da edição «Turma presencial».", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(timetable).toBeVisible();
    await expect(page.getByText("Leitura recomendada")).toHaveCount(0);
    // What is hidden from everyone is still shown to the trainer, marked.
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Notas do formador (rascunho)" })
        .getByText("Oculto"),
    ).toBeVisible();

    // The preview stays in the edition from one material to the next.
    await timetable.getByRole("link").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Horário das sessões" }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`edition=${demoEditions.classroomInPerson}`));
    await page
      .getByRole("navigation", { name: "Materiais do curso" })
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`edition=${demoEditions.classroomInPerson}`));
  });

  test("an invitation names the edition of a course that has several", async ({ page }) => {
    const email = uniqueEmail("edicao");
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/users/invite");
      await field(page, "Endereços de email").fill(email);

      // The choice only appears for a ticked course, and only when there is one to make.
      const edition = page.getByRole("combobox", {
        name: "Edição do curso IA na sala de aula",
        exact: true,
      });
      await expect(edition).toBeHidden();
      await page
        .getByRole("group", { name: /^Cursos/ })
        .getByRole("checkbox", { name: /^IA na sala de aula/ })
        .first()
        .check();
      await expect(edition).toBeVisible();
      await expect(edition.locator("option:checked")).toHaveText("Edição geral");
      await edition.selectOption(demoEditions.classroomInPerson);

      await page.getByRole("radio", { name: /Criar ligações para eu enviar/ }).check();
      await page.getByRole("button", { name: "Convidar" }).click();
      await expect(page.getByRole("region", { name: "Resultado" })).toContainText(email);

      const { data: invited } = await admin()
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();
      const { data: enrolment } = await admin()
        .from("enrollments")
        .select("course_id, edition_id")
        .eq("user_id", invited!.id);
      expect(enrolment).toEqual([
        { course_id: classroom.id, edition_id: demoEditions.classroomInPerson },
      ]);

      // The person's own page shows where they are, and moves them when it is changed.
      await page.goto(`/pt/trainer/users/${invited!.id}`);
      const theirs = page.getByRole("combobox", {
        name: "Edição do curso IA na sala de aula",
        exact: true,
      });
      await expect(theirs).toHaveValue(demoEditions.classroomInPerson);
      await theirs.selectOption({ label: "Edição geral" });
      await page.getByRole("button", { name: "Guardar cursos" }).click();
      await expectNotice(page, "Cursos atualizados.");
      await expect
        .poll(async () => {
          const { data } = await admin()
            .from("enrollments")
            .select("edition_id")
            .eq("user_id", invited!.id)
            .single();
          return data?.edition_id;
        })
        .not.toBe(demoEditions.classroomInPerson);
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
