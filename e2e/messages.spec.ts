import { expect, test } from "@playwright/test";
import {
  admin,
  confirmation,
  deleteUserByEmail,
  DEMO_PASSWORD,
  demoUsers,
  expectNotice,
  field,
  freshCourse,
  signIn,
  signInAsTrainer,
  uniqueEmail,
} from "./helpers";

/**
 * Trainers of a course, and the messages between its learners and them: a learner asks, a
 * trainer answers some time later, and each finds what is waiting for them marked.
 */

type Course = Awaited<ReturnType<typeof freshCourse>>;

/** Opens a course to its learners: off the public site, with the summaries that asks for. */
async function openToLearners(course: Course) {
  const { error } = await admin()
    .from("courses")
    .update({ status: "unlisted", summary_pt: "Resumo", summary_en: "Summary" })
    .eq("id", course.id);
  expect(error).toBeNull();
}

/** An account with a password, ready to sign in. */
async function createAccount(email: string, fullName: string, role: "learner" | "trainer") {
  const service = admin();
  const created = await service.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, locale: "pt" },
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  if (role === "trainer") {
    const promoted = await service.from("profiles").update({ role: "trainer" }).eq("id", id);
    expect(promoted.error).toBeNull();
  }
  return id;
}

async function enrol(userId: string, course: Course) {
  const service = admin();
  const { data: edition } = await service
    .from("editions")
    .select("id")
    .eq("course_id", course.id)
    .single();
  const enrolled = await service
    .from("enrollments")
    .insert({ user_id: userId, course_id: course.id, edition_id: edition!.id });
  expect(enrolled.error).toBeNull();
}

test.describe("messages between a learner and the trainers of a course", () => {
  test("a learner asks, a trainer answers later, and each sees what is waiting for them", async ({
    page,
    isMobile,
  }) => {
    test.slow();
    const course = await freshCourse("Curso com perguntas");
    const email = uniqueEmail("pergunta");
    const service = admin();
    try {
      await openToLearners(course);
      const learnerId = await createAccount(email, "Lia Pergunta", "learner");
      await enrol(learnerId, course);
      const coursePage = `/pt/learn/courses/${course.slug}`;
      const thread = page.getByRole("list", { name: "Mensagens desta conversa" });
      const ask = page.getByRole("link", { name: /Dúvidas sobre o curso\?/ });
      // The label of a conversation that waits, as its own page shows it once. (The list has
      // one on every row that waits: look for it only once the conversation's page is open.)
      const waiting = page.getByText("Por responder", { exact: true });

      // The trainer says who teaches the course: here, themselves.
      await signInAsTrainer(page);
      await page.goto(`/pt/trainer/courses/${course.id}`);
      await expect(page.getByRole("heading", { level: 2, name: "Formadores" })).toBeVisible();
      const me = page.getByRole("checkbox", { name: /Formador Demo/ });
      await expect(me).not.toBeChecked();
      await me.check();
      await page.getByRole("button", { name: "Guardar formadores" }).click();
      await expectNotice(page, "Formadores do curso atualizados.");
      await page.reload();
      await expect(page.getByRole("checkbox", { name: /Formador Demo/ })).toBeChecked();
      await page.goto("/pt/trainer/courses");
      await expect(page.getByRole("listitem").filter({ hasText: course.title })).toContainText(
        "Formadores: Formador Demo",
      );

      // The learner is told who to write to, and writes.
      await page.context().clearCookies();
      await signIn(page, email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await page.goto(coursePage);
      await expect(ask).toContainText("Escreva ao formador: Formador Demo.");
      await expect(ask).not.toContainText("Resposta nova");
      await ask.click();
      await expect(page).toHaveURL(new RegExp(`${coursePage}/messages$`));
      await expect(
        page.getByRole("heading", { level: 1, name: "Fale com os formadores" }),
      ).toBeVisible();
      await expect(
        page.getByText("O formador deste curso, Formador Demo, responde aqui às suas dúvidas."),
      ).toBeVisible();
      await expect(page.getByText(/^Ainda não escreveu nada\./)).toBeVisible();

      // Nothing to send yet.
      const box = field(page, "A sua mensagem");
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByText("Preencha este campo.")).toBeVisible();
      await expect(thread).toHaveCount(0);

      await box.fill("Há gravação da primeira sessão?\nPerdi a última meia hora.");
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(confirmation(page, "Mensagem enviada.")).toBeVisible();
      await expect(thread.getByRole("listitem")).toHaveCount(1);
      await expect(thread.getByRole("listitem").first()).toContainText("Eu");
      await expect(thread.getByRole("listitem").first()).toContainText(
        "Há gravação da primeira sessão?",
      );
      // The box is empty again, ready for the next one.
      await expect(box).toHaveValue("");

      // The trainer finds it waiting: in the menu's count, and first in the list.
      await page.context().clearCookies();
      await signInAsTrainer(page);
      if (!isMobile) {
        await expect(
          page.locator("aside nav").getByLabel(/^\d+ conversas? por responder$/),
        ).toBeVisible();
      }
      await page.goto("/pt/trainer/messages");
      await expect(page.getByRole("heading", { level: 1, name: "Mensagens" })).toBeVisible();
      const row = page
        .getByRole("list", { name: "Conversas" })
        .getByRole("listitem")
        .filter({ hasText: "Lia Pergunta" });
      await expect(row).toContainText(course.title);
      await expect(row).toContainText("Há gravação da primeira sessão? Perdi a última meia hora.");
      await expect(row).toContainText("Por responder");
      await expect(row).toContainText(/À espera desde /);
      await row.getByRole("link", { name: "Lia Pergunta" }).click();

      await expect(page.getByRole("heading", { level: 1, name: "Lia Pergunta" })).toBeVisible();
      await expect(page.getByText("Formadores do curso: Formador Demo")).toBeVisible();
      await expect(waiting).toBeVisible();
      await expect(thread.getByRole("listitem")).toHaveCount(1);
      await expect(thread.getByRole("listitem").first()).toContainText("Lia Pergunta");

      await field(page, "A sua resposta").fill("Não há gravação, mas os diapositivos têm tudo.");
      await page.getByRole("button", { name: "Responder" }).click();
      await expect(confirmation(page, "Resposta enviada.")).toBeVisible();
      await expect(thread.getByRole("listitem")).toHaveCount(2);
      await expect(thread.getByRole("listitem").nth(1)).toContainText("Eu");
      await expect(thread.getByRole("listitem").nth(1)).toContainText(
        "Não há gravação, mas os diapositivos têm tudo.",
      );
      // Answered, and not yet read by the learner.
      await expect(waiting).toHaveCount(0);
      await expect(page.getByText("Resposta por ler", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Não precisa de resposta" })).toHaveCount(0);

      // It left the list of those waiting; the full list shows the answer.
      await page.goto("/pt/trainer/messages");
      await expect(page.getByRole("heading", { level: 1, name: "Mensagens" })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: "Lia Pergunta" })).toHaveCount(0);
      await page.getByRole("link", { name: /^Todas \(\d+\)$/ }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/messages\?show=all$/);
      await expect(page.getByRole("listitem").filter({ hasText: "Lia Pergunta" })).toContainText(
        "Resposta: Não há gravação, mas os diapositivos têm tudo.",
      );

      // The learner comes back another day: the course is marked, and so is the answer.
      await page.context().clearCookies();
      await signIn(page, email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      await expect(page.getByText("Resposta nova dos formadores")).toBeVisible();
      await page.goto(coursePage);
      await expect(ask).toContainText("Resposta nova");
      await ask.click();
      const answer = thread.getByRole("listitem").nth(1);
      await expect(answer).toContainText("Formador Demo");
      await expect(answer).toContainText("Não há gravação, mas os diapositivos têm tudo.");
      await expect(answer.getByText("Nova", { exact: true })).toBeVisible();

      // Having opened it, nothing is new any more.
      await page.reload();
      await expect(thread.getByRole("listitem")).toHaveCount(2);
      await expect(thread.getByText("Nova", { exact: true })).toHaveCount(0);
      await page.goto(coursePage);
      await expect(ask).toBeVisible();
      await expect(ask).not.toContainText("Resposta nova");
      await page.goto("/pt/learn");
      await expect(page.getByRole("heading", { level: 1, name: "Os meus cursos" })).toBeVisible();
      await expect(page.getByText("Resposta nova dos formadores")).toHaveCount(0);

      // A thank-you waits like any message, until a trainer says it needs no answer.
      await page.goto(`${coursePage}/messages`);
      await field(page, "A sua mensagem").fill("Obrigada!");
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(thread.getByRole("listitem")).toHaveCount(3);

      await page.context().clearCookies();
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/messages");
      await page
        .getByRole("listitem")
        .filter({ hasText: "Lia Pergunta" })
        .getByRole("link", { name: "Lia Pergunta" })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Lia Pergunta" })).toBeVisible();
      await expect(waiting).toBeVisible();
      await page.getByRole("button", { name: "Não precisa de resposta" }).click();
      await expectNotice(page, "A conversa já não está à espera de resposta.");
      await expect(waiting).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Não precisa de resposta" })).toHaveCount(0);
      const { data: aside } = await service
        .from("conversations")
        .select("unanswered_since, unread_since")
        .eq("learner_id", learnerId)
        .single();
      expect(aside).toEqual({ unanswered_since: null, unread_since: null });

      // Deleting asks first, then leads back to the list.
      await page.getByRole("button", { name: "Eliminar conversa" }).click();
      await expect(page.getByRole("alertdialog")).toContainText(
        "Eliminar a conversa com Lia Pergunta?",
      );
      await page.getByRole("alertdialog").getByRole("button", { name: "Sim, eliminar" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/messages$/);
      await expectNotice(page, "Conversa eliminada.");
      const { data: left } = await service
        .from("conversations")
        .select("id")
        .eq("learner_id", learnerId);
      expect(left).toEqual([]);
    } finally {
      await deleteUserByEmail(email);
      await course.remove();
    }
  });

  test("a trainer's list is that of their own courses, and of courses nobody teaches", async ({
    page,
  }) => {
    const course = await freshCourse("Curso de outra pessoa");
    const learnerEmail = uniqueEmail("duvida");
    const trainerEmail = uniqueEmail("formadora");
    const service = admin();
    try {
      await openToLearners(course);
      const learnerId = await createAccount(learnerEmail, "Rui Dúvida", "learner");
      await enrol(learnerId, course);
      // Someone else teaches this course, and its learner has written to her.
      const otherTrainer = await createAccount(trainerEmail, "Outra Formadora", "trainer");
      const taught = await service
        .from("course_trainers")
        .insert({ course_id: course.id, user_id: otherTrainer });
      expect(taught.error).toBeNull();
      const now = new Date().toISOString();
      const started = await service
        .from("conversations")
        .insert({
          course_id: course.id,
          learner_id: learnerId,
          last_message_at: now,
          unanswered_since: now,
        })
        .select("id")
        .single();
      expect(started.error).toBeNull();
      const written = await service.from("conversation_messages").insert({
        conversation_id: started.data!.id,
        author_id: learnerId,
        from_trainer: false,
        body: "Quando é a próxima sessão?",
        created_at: now,
      });
      expect(written.error).toBeNull();

      const row = page.getByRole("listitem").filter({ hasText: "Rui Dúvida" });
      await signInAsTrainer(page);
      await page.goto("/pt/trainer/messages");
      await expect(page.getByRole("heading", { level: 1, name: "Mensagens" })).toBeVisible();
      await expect(
        page.getByText("Dos cursos de que é formador e dos que ainda não têm nenhum."),
      ).toBeVisible();
      await expect(row).toHaveCount(0);

      // Every course's messages are one step away, marked as someone else's.
      await page.getByRole("link", { name: "Ver todos os cursos" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/messages\?course=all$/);
      await expect(page.getByText("De todos os cursos.")).toBeVisible();
      await expect(row).toContainText("Quando é a próxima sessão?");
      await expect(row).toContainText("Curso de outros formadores");
      // Any trainer may open it, and sees whose course it is.
      await row.getByRole("link", { name: "Rui Dúvida" }).click();
      await expect(page.getByText("Formadores do curso: Outra Formadora")).toBeVisible();
      await page.goto("/pt/trainer/messages?course=all");
      await page.getByRole("link", { name: "Ver só os meus cursos" }).click();
      await expect(page).toHaveURL(/\/pt\/trainer\/messages$/);
      await expect(page.getByRole("heading", { level: 1, name: "Mensagens" })).toBeVisible();
      await expect(row).toHaveCount(0);

      // Once nobody teaches the course, its messages fall to every trainer.
      const freed = await service.from("course_trainers").delete().eq("course_id", course.id);
      expect(freed.error).toBeNull();
      await page.reload();
      await expect(row).toContainText("Quando é a próxima sessão?");
      await expect(row).not.toContainText("Curso de outros formadores");
      await row.getByRole("link", { name: "Rui Dúvida" }).click();
      await expect(page.getByText(/^Este curso ainda não tem formadores/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Escolher formadores" })).toHaveAttribute(
        "href",
        `/pt/trainer/courses/${course.id}`,
      );

      // Looking at the course as a learner, a trainer is shown where learners write, and is
      // taken to that course's messages in the back-office instead.
      await page.goto(`/pt/learn/courses/${course.slug}`);
      const ask = page.getByRole("link", { name: /Dúvidas sobre o curso\?/ });
      await expect(ask).toContainText("É aqui que os formandos escrevem aos formadores.");
      await page.goto(`/pt/learn/courses/${course.slug}/messages`);
      await expect(page).toHaveURL(
        new RegExp(`/pt/trainer/messages\\?show=all&course=${course.id}$`),
      );
      await expect(page.getByText(`Só do curso «${course.title}».`)).toBeVisible();
      await expect(row).toContainText("Quando é a próxima sessão?");
    } finally {
      await deleteUserByEmail(learnerEmail);
      await deleteUserByEmail(trainerEmail);
      await course.remove();
    }
  });

  test("only a learner of the course can open its conversation, and only trainers the list", async ({
    page,
  }) => {
    const course = await freshCourse("Curso fechado");
    try {
      await openToLearners(course);
      // John is a learner, but not of this course.
      await signIn(page, demoUsers.john.email);
      await expect(page).toHaveURL(/\/pt\/learn$/);
      for (const path of [
        `/pt/learn/courses/${course.slug}/messages`,
        "/pt/trainer/messages",
        "/pt/trainer/messages?course=all",
      ]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
        ).toBeVisible();
      }

      // Signed out, the pages lead to the sign-in page.
      await page.context().clearCookies();
      await page.goto(`/pt/learn/courses/${course.slug}/messages`);
      await expect(page).toHaveURL(/\/pt\/login\?next=/);
      await page.goto("/pt/trainer/messages");
      await expect(page).toHaveURL(/\/pt\/login\?next=/);
    } finally {
      await course.remove();
    }
  });
});
