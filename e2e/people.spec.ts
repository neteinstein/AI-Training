import { expect, test, type Page } from "@playwright/test";
import {
  admin,
  alertWith,
  confirmation,
  deleteUserByEmail,
  demoCourses,
  demoUsers,
  expectNotice,
  field,
  freshCourse,
  latestEmailTo,
  signInAsTrainer,
  unique,
  uniqueEmail,
} from "./helpers";

const NEW_PASSWORD = "uma-palavra-passe-longa";

/** The label of one result line: the address and what happened to it. */
const resultFor = (page: Page, email: string) =>
  page.getByRole("region", { name: "Resultado" }).getByRole("listitem").filter({ hasText: email });

async function tickCourse(page: Page, title: string) {
  await page
    .getByRole("group", { name: /^Cursos/ })
    .getByRole("checkbox", { name: new RegExp(`^${title}`) })
    .check();
}

test.describe("learners of a course", () => {
  test("people with an account are added to a course and removed from it", async ({ page }) => {
    const course = await freshCourse("Inscrições");
    try {
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${course.id}/learners`);
      await expect(page.getByText("Ainda ninguém está inscrito neste curso.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Formandos (0)" })).toBeVisible();

      // Nothing is sent without choosing someone.
      await page.getByRole("button", { name: "Adicionar ao curso" }).click();
      await expect(alertWith(page, "Escolha pelo menos uma pessoa.")).toBeVisible();
      await page.getByRole("button", { name: "Fechar mensagem" }).click();

      await page.getByRole("checkbox", { name: /John Smith/ }).check();
      await page.getByRole("checkbox", { name: /Ana Santos/ }).check();
      await page.getByRole("button", { name: "Adicionar ao curso" }).click();
      await expectNotice(page, "2 pessoas adicionadas.");
      const enrolled = page.getByRole("list", { name: "Pessoas inscritas" });
      await expect(enrolled.getByRole("link")).toHaveText(["Ana Santos", "John Smith"]);
      await expect(page.getByRole("link", { name: "Formandos (2)" })).toBeVisible();
      await expect(
        page.getByText("Todos os formandos com conta já estão neste curso."),
      ).toBeVisible();

      await page.getByRole("button", { name: "Retirar John Smith do curso" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Retirar John Smith deste curso?");
      await dialog.getByRole("button", { name: "Sim, retirar" }).click();
      await expectNotice(page, "Pessoa retirada do curso.");
      await expect(enrolled.getByRole("link")).toHaveText(["Ana Santos"]);

      // The way to invite someone new leads to the form with this course ticked.
      await page.getByRole("link", { name: "Convidar pessoas novas" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Convidar pessoas" })).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: new RegExp(`^${course.title}`) }),
      ).toBeChecked();
    } finally {
      await course.remove();
    }
  });
});

test.describe("invitations", () => {
  test("an invitation by email: the person activates the account and finds the course", async ({
    page,
  }) => {
    const email = uniqueEmail("convite");
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/users");
      await page.getByRole("link", { name: "Convidar pessoas" }).click();

      // An address that is not one is named back to the trainer.
      await field(page, "Endereços de email").fill(`${email}, isto-nao-e-email`);
      await page.getByRole("button", { name: "Convidar" }).click();
      await expect(page.getByText("Verifique este endereço: isto-nao-e-email")).toBeVisible();

      await field(page, "Endereços de email").fill(email);
      await field(page, "Nome (opcional)").fill("Rita Convidada");
      await tickCourse(page, "IA na prática clínica");
      await page.getByRole("button", { name: "Convidar" }).click();
      await expect(confirmation(page, "1 endereço tratado.")).toBeVisible();
      await expect(resultFor(page, email)).toContainText("Convite enviado por email");

      const message = await latestEmailTo(email);
      expect(message.link).toContain("/pt/auth/confirm?token_hash=");

      // The invited person, in a browser that is not signed in.
      await page.context().clearCookies();
      await page.goto(message.link);
      await expect(
        page.getByRole("heading", { level: 1, name: "Recebeu um convite" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Continuar" }).click();
      await expect(page).toHaveURL(/\/pt\/auth\/set-password$/);
      await expect(page.getByText("IA na prática clínica")).toBeVisible();
      await field(page, "Nova palavra-passe").fill(NEW_PASSWORD);
      await field(page, "Repetir a palavra-passe").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Guardar e continuar" }).click();

      await expect(page).toHaveURL(/\/pt\/learn$/);
      await expect(page.getByText("Olá, Rita Convidada")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 })).toHaveText(["IA na prática clínica"]);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("invitations as links: nothing is emailed, and someone with an account just gets the course", async ({
    page,
  }) => {
    const email = uniqueEmail("ligacao");
    const course = await freshCourse("Por ligação");
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/users/invite");
      await field(page, "Endereços de email").fill(`${email}\n${demoUsers.ana.email}`);
      await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
      await tickCourse(page, course.title);
      await page.getByRole("radio", { name: /Criar ligações para eu enviar/ }).check();
      await page.getByRole("button", { name: "Convidar" }).click();
      await expect(confirmation(page, "2 endereços tratados.")).toBeVisible();

      await expect(resultFor(page, email)).toContainText("Convite criado");
      const link = resultFor(page, email).getByRole("textbox");
      await expect(link).toHaveValue(/\/en\/auth\/confirm\?token_hash=[^&]+&type=invite/);
      await expect(resultFor(page, demoUsers.ana.email)).toContainText(
        "Já tinha conta: cursos atualizados",
      );
      await expect(resultFor(page, demoUsers.ana.email).getByRole("textbox")).toHaveCount(0);

      // The form is ready for the next invitation, with the same choices.
      await expect(field(page, "Endereços de email")).toHaveValue("");
      await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue("en");

      const service = admin();
      const { data: enrolled } = await service
        .from("enrollments")
        .select("user_id")
        .eq("course_id", course.id);
      expect(enrolled).toHaveLength(2);

      // The link works for the person it was made for.
      const address = await link.inputValue();
      await page.context().clearCookies();
      await page.goto(address);
      await expect(
        page.getByRole("heading", { level: 1, name: "You have been invited" }),
      ).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
      await course.remove();
    }
  });
});

test.describe("users", () => {
  test("the list can be searched and narrowed", async ({ page }) => {
    await signInAsTrainer(page);
    await page.goto("/pt/trainer/users");
    const names = page.getByRole("list", { name: "Utilizadores" }).getByRole("link");
    await expect(names.filter({ hasText: "Ana Santos" })).toHaveCount(1);

    await field(page, "Procurar").fill("ana");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/\/pt\/trainer\/users\?q=ana/);
    await expect(names).toHaveText(["Ana Santos"]);

    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/pt\/trainer\/users$/);
    await expect(field(page, "Procurar")).toHaveValue("");
    await field(page, "Mostrar").selectOption("trainers");
    await page.getByRole("button", { name: "Filtrar" }).click();
    // Other trainers may exist (the database tests keep one); learners must not be listed.
    await expect(names.filter({ hasText: "Formador Demo" })).toHaveCount(1);
    await expect(names.filter({ hasText: /Ana Santos|John Smith/ })).toHaveCount(0);
    await expect(page.getByText("É a sua conta.")).toBeVisible();

    await field(page, "Procurar").fill("ninguém com este nome");
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByText("Nenhum utilizador corresponde aos filtros.")).toBeVisible();
  });

  test("a person's page: details, courses, role, a way back in, and removal", async ({ page }) => {
    const email = uniqueEmail("pessoa");
    const name = unique("Pessoa");
    const service = admin();
    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password: "demo-password-123",
      email_confirm: true,
      user_metadata: { full_name: name, locale: "pt" },
    });
    expect(error).toBeNull();
    const id = created.user!.id;
    try {
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/users/${id}`);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

      await field(page, "Nome").fill(`${name} Silva`);
      await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await expect(confirmation(page, "Dados guardados.")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: `${name} Silva` })).toBeVisible();

      await tickCourse(page, "Avaliação e feedback com IA");
      await page.getByRole("button", { name: "Guardar cursos" }).click();
      await expectNotice(page, "Cursos atualizados.");
      const { data: enrolments } = await service
        .from("enrollments")
        .select("course_id")
        .eq("user_id", id);
      expect(enrolments?.map((row) => row.course_id)).toEqual([demoCourses.assessment.id]);

      const role = page.getByRole("combobox", { name: "Papel" });
      await role.selectOption("trainer");
      await page.getByRole("button", { name: "Alterar papel" }).click();
      await expectNotice(page, "Papel alterado.");
      // Once saved, the list shows the new role, so the old one can be chosen again.
      await expect(role).toHaveValue("trainer");
      await expect(
        page.getByText("Os formadores têm acesso a todos os cursos. As inscrições"),
      ).toBeVisible();
      await role.selectOption("learner");
      await page.getByRole("button", { name: "Alterar papel" }).click();
      await expectNotice(page, "Papel alterado.");
      await expect(role).toHaveValue("learner");

      // A link to set a new password, for someone who cannot sign in. Nothing is emailed.
      await page.getByRole("button", { name: "Criar ligação de acesso" }).click();
      await expect(field(page, "Ligação para definir nova palavra-passe (uso único)")).toHaveValue(
        /\/en\/auth\/confirm\?token_hash=[^&]+&type=recovery/,
      );

      await page.getByRole("button", { name: "Eliminar conta" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(`Eliminar a conta de ${name} Silva?`);
      await dialog.getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/users$/);
      await expectNotice(page, "Conta eliminada.");
      const { data: gone } = await service.from("profiles").select("id").eq("id", id);
      expect(gone).toEqual([]);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("a trainer cannot demote or delete their own account", async ({ page }) => {
    await signInAsTrainer(page);
    await page.goto(`/pt/trainer/users/${demoUsers.trainer.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Formador Demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Eliminar conta" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Criar ligação de acesso" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Papel" }).selectOption("learner");
    await page.getByRole("button", { name: "Alterar papel" }).click();
    await expect(
      alertWith(page, "Não pode retirar a si próprio o papel de formador."),
    ).toBeVisible();
    const { data: still } = await admin()
      .from("profiles")
      .select("role")
      .eq("id", demoUsers.trainer.id)
      .single();
    expect(still?.role).toBe("trainer");
  });
});

test.describe("information requests", () => {
  test("a request is followed up, becomes an invitation, and can be deleted", async ({ page }) => {
    const service = admin();
    const email = uniqueEmail("pedido");
    const name = unique("Interessada");
    const { data: request, error } = await service
      .from("info_requests")
      .insert({
        name,
        email,
        organisation: "Escola de Teste",
        course_id: demoCourses.clinical.id,
        message: "Quando começa a próxima edição?",
        locale: "pt",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    try {
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/requests");
      const card = page.getByRole("listitem").filter({ hasText: name });
      await expect(card).toContainText("IA na prática clínica");
      await expect(card).toContainText("Escola de Teste");
      await expect(card).toContainText("Quando começa a próxima edição?");
      await expect(card.getByRole("link", { name: email })).toHaveAttribute(
        "href",
        `mailto:${email}`,
      );

      await card.getByRole("button", { name: "Marcar como contactado" }).click();
      await expectNotice(page, "Pedido atualizado.");
      await expect(card).toHaveCount(0);
      await page.getByRole("link", { name: /^Contactados \(\d+\)$/ }).click();
      await expect(card).toContainText("Contactado");

      // Inviting uses what the person wrote: name, address, language and the course.
      await card.getByRole("link", { name: `Convidar ${name}` }).click();
      await expect(page.getByRole("heading", { level: 1, name: `Convidar ${name}` })).toBeVisible();
      await expect(page.getByText(`Convite para ${name} (${email})`)).toBeVisible();
      await expect(page.getByRole("checkbox", { name: /^IA na prática clínica/ })).toBeChecked();
      await page.getByRole("radio", { name: /Criar ligações para eu enviar/ }).check();
      await page.getByRole("button", { name: "Convidar" }).click();
      await expect(resultFor(page, email)).toContainText("Convite criado");
      await expect(resultFor(page, email).getByRole("textbox")).toHaveValue(
        /\/pt\/auth\/confirm\?token_hash=[^&]+&type=invite/,
      );

      const { data: after } = await service
        .from("info_requests")
        .select("status")
        .eq("id", request!.id)
        .single();
      expect(after?.status).toBe("invited");
      const { data: profile } = await service
        .from("profiles")
        .select("id, full_name")
        .eq("email", email)
        .single();
      expect(profile?.full_name).toBe(name);
      const { data: enrolments } = await service
        .from("enrollments")
        .select("course_id")
        .eq("user_id", profile!.id);
      expect(enrolments?.map((row) => row.course_id)).toEqual([demoCourses.clinical.id]);

      // Back among the requests, it is now under "invited", linked to the new account.
      await page
        .getByRole("link", { name: "Pedidos de informação" })
        .filter({ visible: true })
        .first()
        .click();
      await page.getByRole("link", { name: /^Convidados \(\d+\)$/ }).click();
      await expect(card).toContainText("Convite por aceitar");
      await card.getByRole("button", { name: /^Eliminar/ }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expectNotice(page, "Pedido eliminado.");
      await expect(card).toHaveCount(0);
    } finally {
      await service.from("info_requests").delete().eq("email", email);
      await deleteUserByEmail(email);
    }
  });
});
